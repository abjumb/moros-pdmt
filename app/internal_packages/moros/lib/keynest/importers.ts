/**
 * Pure parsers for the three credential-export formats KeyNest can import:
 * generic CSV (`name,username,password,url`), Bitwarden JSON exports, and
 * 1Password CSV exports.
 *
 * Every parser is a pure function: it takes the raw file text and returns a
 * list of plain entry objects plus a count of rows it had to skip. It never
 * touches disk, the keychain, or the log. The import *flow* (in the store/UI)
 * is responsible for routing each parsed password through the secure
 * KeyManager path — the parsed `password` field here is held only transiently
 * and must never be written to `vault.json` or logged.
 */

export interface ImportedEntry {
  name: string;
  username: string;
  url: string;
  password: string;
}

export interface ImportResult {
  entries: ImportedEntry[];
  /** Rows that could not be turned into a usable entry (no name, malformed). */
  skipped: number;
}

const EMPTY: ImportResult = { entries: [], skipped: 0 };

/**
 * Parse a single CSV line into fields, honoring RFC 4180 double-quoting:
 * quoted fields may contain commas and newlines-as-text, and `""` is an
 * escaped quote. Returns the field list. (Used by the CSV importers; the
 * line splitting that feeds it already accounts for quoted newlines.)
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Split CSV text into logical rows of fields, treating newlines inside quoted
 * fields as part of the field rather than row separators. Empty trailing rows
 * are dropped.
 */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Treat \r\n as a single break.
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop rows that are entirely empty (e.g. blank trailing lines).
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Build a header → column-index map from a header row (lower-cased, trimmed). */
function headerIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, idx) => {
    const key = name.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, idx);
  });
  return map;
}

/** First header among `names` that exists in the map, or -1. */
function pick(map: Map<string, number>, names: string[]): number {
  for (const name of names) {
    const idx = map.get(name);
    if (idx !== undefined) return idx;
  }
  return -1;
}

function cell(fields: string[], idx: number): string {
  if (idx < 0 || idx >= fields.length) return '';
  return (fields[idx] || '').trim();
}

/**
 * Parse a generic password-manager CSV with a header row. Recognizes the
 * documented `name,username,password,url` columns (case-insensitive) and a few
 * common aliases (`title`, `login`, `login_username`, `login_password`,
 * `website`). A row is skipped when it has no name. Malformed or empty input
 * degrades to an empty result rather than throwing.
 */
export function parseGenericCsv(text: string): ImportResult {
  if (!text || !text.trim()) return { ...EMPTY };

  let rows: string[][];
  try {
    rows = parseCsvRows(text);
  } catch {
    return { ...EMPTY };
  }
  if (rows.length < 2) return { ...EMPTY };

  const map = headerIndex(rows[0]);
  const nameIdx = pick(map, ['name', 'title']);
  const userIdx = pick(map, ['username', 'user', 'login', 'login_username']);
  const passIdx = pick(map, ['password', 'login_password']);
  const urlIdx = pick(map, ['url', 'website', 'uri', 'login_uri']);

  const entries: ImportedEntry[] = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    const name = cell(fields, nameIdx);
    if (!name) {
      skipped += 1;
      continue;
    }
    entries.push({
      name,
      username: cell(fields, userIdx),
      password: idx0(fields, passIdx),
      url: cell(fields, urlIdx),
    });
  }
  return { entries, skipped };
}

// Passwords must be preserved verbatim (leading/trailing spaces can be
// significant), so unlike other cells they are not trimmed.
function idx0(fields: string[], idx: number): string {
  if (idx < 0 || idx >= fields.length) return '';
  return fields[idx] || '';
}

/**
 * Parse a Bitwarden JSON export. The relevant shape is:
 *   { items: [ { name, login: { username, password, uris: [{ uri }] } } ] }
 * Non-login items (cards, notes, identities) and items without a name are
 * skipped. Malformed JSON degrades to an empty result.
 */
export function parseBitwardenJson(text: string): ImportResult {
  if (!text || !text.trim()) return { ...EMPTY };

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...EMPTY };
  }

  const items = Array.isArray(data?.items) ? data.items : null;
  if (!items) return { ...EMPTY };

  const entries: ImportedEntry[] = [];
  let skipped = 0;
  for (const item of items) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const login = item?.login;
    // Only login items carry credentials; everything else is skipped.
    if (!name || !login || typeof login !== 'object') {
      skipped += 1;
      continue;
    }
    const username = typeof login.username === 'string' ? login.username.trim() : '';
    const password = typeof login.password === 'string' ? login.password : '';
    let url = '';
    if (Array.isArray(login.uris) && login.uris.length > 0) {
      const first = login.uris[0];
      if (typeof first?.uri === 'string') url = first.uri.trim();
    }
    entries.push({ name, username, password, url });
  }
  return { entries, skipped };
}

/**
 * Parse a 1Password CSV export. 1Password's column names vary by version, so
 * we resolve them case-insensitively with aliases (`title`, `username`,
 * `password`, `url`/`website`/`urls`). Rows without a title are skipped, and
 * malformed input degrades to an empty result.
 */
export function parse1PasswordCsv(text: string): ImportResult {
  if (!text || !text.trim()) return { ...EMPTY };

  let rows: string[][];
  try {
    rows = parseCsvRows(text);
  } catch {
    return { ...EMPTY };
  }
  if (rows.length < 2) return { ...EMPTY };

  const map = headerIndex(rows[0]);
  const nameIdx = pick(map, ['title', 'name']);
  const userIdx = pick(map, ['username', 'user']);
  const passIdx = pick(map, ['password']);
  const urlIdx = pick(map, ['url', 'website', 'urls']);

  const entries: ImportedEntry[] = [];
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const fields = rows[i];
    const name = cell(fields, nameIdx);
    if (!name) {
      skipped += 1;
      continue;
    }
    entries.push({
      name,
      username: cell(fields, userIdx),
      password: idx0(fields, passIdx),
      url: cell(fields, urlIdx),
    });
  }
  return { entries, skipped };
}

export type ImportFormat = 'csv' | 'bitwarden' | '1password';

/** Dispatch to the parser for the chosen format. */
export function parseImport(format: ImportFormat, text: string): ImportResult {
  switch (format) {
    case 'bitwarden':
      return parseBitwardenJson(text);
    case '1password':
      return parse1PasswordCsv(text);
    case 'csv':
    default:
      return parseGenericCsv(text);
  }
}
