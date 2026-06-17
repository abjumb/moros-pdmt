// Direct imports from source — the plugin is not registered in moros-exports.
import {
  parseGenericCsv,
  parseBitwardenJson,
  parse1PasswordCsv,
  parseCsvLine,
  parseImport,
} from '../internal_packages/moros/lib/keynest/importers';

describe('KeyNest importers', () => {
  describe('parseCsvLine', () => {
    it('splits a plain line', () => {
      expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('honors quoted fields with embedded commas and escaped quotes', () => {
      expect(parseCsvLine('"a,b","c""d",e')).toEqual(['a,b', 'c"d', 'e']);
    });
  });

  describe('parseGenericCsv', () => {
    it('parses the documented name,username,password,url columns', () => {
      const csv = ['name,username,password,url', 'GitHub,octocat,hunter2,https://github.com'].join(
        '\n'
      );
      const result = parseGenericCsv(csv);
      expect(result.skipped).toBe(0);
      expect(result.entries.length).toBe(1);
      expect(result.entries[0]).toEqual({
        name: 'GitHub',
        username: 'octocat',
        password: 'hunter2',
        url: 'https://github.com',
      });
    });

    it('resolves columns case-insensitively and in any order', () => {
      const csv = ['URL,Password,Name,Username', 'https://x.com,pw,Site,bob'].join('\n');
      const result = parseGenericCsv(csv);
      expect(result.entries[0].name).toBe('Site');
      expect(result.entries[0].username).toBe('bob');
      expect(result.entries[0].password).toBe('pw');
      expect(result.entries[0].url).toBe('https://x.com');
    });

    it('preserves passwords verbatim (no trimming) but trims other fields', () => {
      const csv = ['name,username,password,url', '"  Site  ",user,"  spaced  ",url'].join('\n');
      const result = parseGenericCsv(csv);
      expect(result.entries[0].name).toBe('Site');
      expect(result.entries[0].password).toBe('  spaced  ');
    });

    it('skips rows missing a name', () => {
      const csv = ['name,username,password,url', ',user,pw,url', 'Real,user2,pw2,url2'].join('\n');
      const result = parseGenericCsv(csv);
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Real');
      expect(result.skipped).toBe(1);
    });

    it('tolerates missing columns', () => {
      const csv = ['name,password', 'OnlyName,secret'].join('\n');
      const result = parseGenericCsv(csv);
      expect(result.entries[0].name).toBe('OnlyName');
      expect(result.entries[0].username).toBe('');
      expect(result.entries[0].url).toBe('');
      expect(result.entries[0].password).toBe('secret');
    });

    it('returns an empty result for empty or header-only input', () => {
      expect(parseGenericCsv('')).toEqual({ entries: [], skipped: 0 });
      expect(parseGenericCsv('name,username,password,url')).toEqual({ entries: [], skipped: 0 });
    });
  });

  describe('parseBitwardenJson', () => {
    const sample = JSON.stringify({
      items: [
        {
          name: 'Email',
          login: {
            username: 'me@example.com',
            password: 's3cret',
            uris: [{ uri: 'https://mail.example.com' }],
          },
        },
        // A secure note (no login) — should be skipped.
        { name: 'My Note', notes: 'remember this' },
        // No name — should be skipped.
        { login: { username: 'x', password: 'y' } },
      ],
    });

    it('extracts login items', () => {
      const result = parseBitwardenJson(sample);
      expect(result.entries.length).toBe(1);
      expect(result.entries[0]).toEqual({
        name: 'Email',
        username: 'me@example.com',
        password: 's3cret',
        url: 'https://mail.example.com',
      });
    });

    it('skips non-login items and items without a name', () => {
      const result = parseBitwardenJson(sample);
      expect(result.skipped).toBe(2);
    });

    it('handles a login item without uris', () => {
      const json = JSON.stringify({
        items: [{ name: 'NoUrl', login: { username: 'u', password: 'p' } }],
      });
      const result = parseBitwardenJson(json);
      expect(result.entries[0].url).toBe('');
    });

    it('degrades gracefully on malformed JSON or wrong shape', () => {
      expect(parseBitwardenJson('{ not json')).toEqual({ entries: [], skipped: 0 });
      expect(parseBitwardenJson('{}')).toEqual({ entries: [], skipped: 0 });
      expect(parseBitwardenJson('[]')).toEqual({ entries: [], skipped: 0 });
      expect(parseBitwardenJson('')).toEqual({ entries: [], skipped: 0 });
    });
  });

  describe('parse1PasswordCsv', () => {
    it('parses a 1Password export with title/username/password/url columns', () => {
      const csv = [
        'Title,Username,Password,URL',
        'Bank,jdoe,Tr0ub4dor,https://bank.example.com',
      ].join('\n');
      const result = parse1PasswordCsv(csv);
      expect(result.entries.length).toBe(1);
      expect(result.entries[0]).toEqual({
        name: 'Bank',
        username: 'jdoe',
        password: 'Tr0ub4dor',
        url: 'https://bank.example.com',
      });
    });

    it('recognizes the "urls" header alias and skips title-less rows', () => {
      const csv = [
        'Title,Username,Password,urls',
        ',nouser,pw,',
        'Site,bob,pw2,https://s.com',
      ].join('\n');
      const result = parse1PasswordCsv(csv);
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Site');
      expect(result.entries[0].url).toBe('https://s.com');
      expect(result.skipped).toBe(1);
    });

    it('degrades gracefully on empty input', () => {
      expect(parse1PasswordCsv('')).toEqual({ entries: [], skipped: 0 });
    });
  });

  describe('parseImport dispatch', () => {
    it('routes to the correct parser by format', () => {
      const csv = ['name,username,password,url', 'A,u,p,x'].join('\n');
      expect(parseImport('csv', csv).entries.length).toBe(1);
      expect(parseImport('1password', 'Title,Password\nA,p').entries.length).toBe(1);
      expect(
        parseImport('bitwarden', JSON.stringify({ items: [{ name: 'A', login: {} }] })).entries
          .length
      ).toBe(1);
    });
  });
});
