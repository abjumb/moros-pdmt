import fs from 'fs';
import path from 'path';
import MailspringStore from 'mailspring-store';

export interface MorosRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export function morosId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Today as a local-timezone ISO date (yyyy-mm-dd). */
export function todayISO() {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function morosDataDirPath() {
  return path.join(AppEnv.getConfigDirPath(), 'moros');
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (err) {
    // Missing on first run; if unreadable / corrupt, callers start fresh.
    return null;
  }
}

/** Write JSON via temp file + rename so a crash mid-save can't truncate data. */
export function writeJsonFileAtomic(filePath: string, data: unknown) {
  const tempPath = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Watch a file in the moros data directory and invoke `callback` (debounced)
 * when it changes. Used to keep stores in popped-out widget windows in sync
 * with the main window — each Electron window has its own store instances,
 * and the JSON files are the shared source of truth.
 */
export function watchMorosFile(filename: string, callback: () => void): () => void {
  let debounce: ReturnType<typeof setTimeout> | null = null;
  try {
    fs.mkdirSync(morosDataDirPath(), { recursive: true });
    const watcher = fs.watch(morosDataDirPath(), (_eventType, changedFile) => {
      if (changedFile && changedFile !== filename) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(callback, 150);
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      watcher.close();
    };
  } catch (err) {
    // File watching is best-effort (it can fail on some network filesystems);
    // without it, widget windows simply won't live-update.
    return () => {};
  }
}

/**
 * Base class for the Moros module stores. Records live in memory and are
 * persisted as JSON beneath `<config>/moros/`, outside the mail database —
 * the database is owned exclusively by the sync engine and is read-only
 * from the app, so module data must not go through DatabaseStore.
 *
 * Writes are debounced and atomic (temp file + rename) so a crash mid-save
 * can't truncate the data file.
 */
export default class MorosDataStore<T extends MorosRecord> extends MailspringStore {
  _filename: string;
  _items: T[];
  _saveTimer: ReturnType<typeof setTimeout> | null = null;
  _selfWriteAtMs = 0;

  constructor(filename: string) {
    super();
    this._filename = filename;
    this._items = this._load();
    watchMorosFile(this._filename, () => {
      // Ignore the watcher echo of our own debounced save.
      if (Date.now() - this._selfWriteAtMs < 1000) return;
      this._items = this._load();
      this.trigger();
    });
  }

  items(): ReadonlyArray<T> {
    return this._items;
  }

  get(id: string): T | undefined {
    return this._items.find((item) => item.id === id);
  }

  create(attrs: Omit<T, 'id' | 'createdAt' | 'updatedAt'>, presetId?: string): T {
    const now = Date.now();
    const item = { ...attrs, id: presetId || morosId(), createdAt: now, updatedAt: now } as T;
    this._items = [item, ...this._items];
    this._queueSave();
    this.trigger();
    return item;
  }

  update(id: string, attrs: Partial<Omit<T, 'id' | 'createdAt'>>): T | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...attrs, id, updatedAt: Date.now() };
    this._items = this._items.map((item) => (item.id === id ? updated : item));
    this._queueSave();
    this.trigger();
    return updated;
  }

  remove(id: string): T | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    this._items = this._items.filter((item) => item.id !== id);
    this._queueSave();
    this.trigger();
    return existing;
  }

  _filePath() {
    return path.join(morosDataDirPath(), this._filename);
  }

  _load(): T[] {
    const parsed = readJsonFile<T[]>(this._filePath());
    return Array.isArray(parsed) ? parsed : [];
  }

  /** Persist immediately, bypassing the debounce — for ordering-sensitive writes. */
  flush() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._save();
  }

  _queueSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 250);
  }

  _save() {
    this._saveTimer = null;
    this._selfWriteAtMs = Date.now();
    try {
      writeJsonFileAtomic(this._filePath(), this._items);
    } catch (err) {
      AppEnv.reportError(err);
    }
  }
}
