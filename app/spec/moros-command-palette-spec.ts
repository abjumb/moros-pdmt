// Direct imports from source — the plugin is not registered in moros-exports.
// We test only the pure `filterCommands` / `subsequenceMatch` functions, which
// have no UI, keymap, or sheet-switching dependencies.
import {
  filterCommands,
  subsequenceMatch,
  PaletteCommand,
} from '../internal_packages/moros/lib/command-palette/filter-commands';

function cmd(id: string, title: string, section: string, keywords?: string): PaletteCommand {
  return { id, title, section, keywords, run: () => {} };
}

const COMMANDS: PaletteCommand[] = [
  cmd('nav:tasks', 'Go to Tasks', 'Navigate', 'todo board'),
  cmd('nav:finance', 'Go to Finance', 'Navigate', 'money budget'),
  cmd('nav:keynest', 'Go to KeyNest', 'Navigate', 'vault secret'),
  cmd('tasks:new', 'New task', 'Tasks', 'create add'),
  cmd('finance:import', 'Import transactions (CSV)', 'Finance', 'upload file'),
];

describe('command palette subsequenceMatch', () => {
  it('matches contiguous substrings', () => {
    expect(subsequenceMatch('Go to Tasks', 'task')).toBe(true);
  });

  it('matches non-contiguous subsequences', () => {
    expect(subsequenceMatch('New task', 'nt')).toBe(true);
    expect(subsequenceMatch('Import transactions', 'imtr')).toBe(true);
  });

  it('is case-insensitive in both directions', () => {
    expect(subsequenceMatch('Go to Finance', 'FINANCE')).toBe(true);
    expect(subsequenceMatch('GO TO FINANCE', 'finance')).toBe(true);
  });

  it('returns false when characters are out of order', () => {
    expect(subsequenceMatch('abc', 'cba')).toBe(false);
  });

  it('returns false when a character is absent', () => {
    expect(subsequenceMatch('New task', 'xyz')).toBe(false);
  });

  it('treats an empty query as a match', () => {
    expect(subsequenceMatch('anything', '')).toBe(true);
  });
});

describe('command palette filterCommands', () => {
  it('returns every command for an empty query', () => {
    expect(filterCommands(COMMANDS, '').length).toBe(COMMANDS.length);
  });

  it('returns every command for a whitespace-only query', () => {
    expect(filterCommands(COMMANDS, '   ').length).toBe(COMMANDS.length);
  });

  it('returns a copy, not the original array', () => {
    const result = filterCommands(COMMANDS, '');
    expect(result === (COMMANDS as PaletteCommand[])).toBe(false);
    expect(result).toEqual(COMMANDS);
  });

  it('filters by a substring of the title', () => {
    const result = filterCommands(COMMANDS, 'finance');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('nav:finance');
  });

  it('matches by subsequence across the title', () => {
    const ids = filterCommands(COMMANDS, 'gtt').map((c) => c.id);
    expect(ids).toContain('nav:tasks'); // "Go To Tasks"
  });

  it('matches against keywords as well as the title', () => {
    const ids = filterCommands(COMMANDS, 'vault').map((c) => c.id);
    expect(ids).toContain('nav:keynest');
  });

  it('matches against the section name', () => {
    const ids = filterCommands(COMMANDS, 'navigate').map((c) => c.id);
    expect(ids).toContain('nav:tasks');
    expect(ids).toContain('nav:finance');
    expect(ids).toContain('nav:keynest');
  });

  it('is case-insensitive', () => {
    const lower = filterCommands(COMMANDS, 'tasks').map((c) => c.id);
    const upper = filterCommands(COMMANDS, 'TASKS').map((c) => c.id);
    expect(upper).toEqual(lower);
  });

  it('preserves the original registry ordering of matches', () => {
    // "o" appears in several titles; the survivors must stay in input order.
    const result = filterCommands(COMMANDS, 'o');
    const indices = result.map((c) => COMMANDS.findIndex((orig) => orig.id === c.id));
    const sorted = indices.slice().sort((a, b) => a - b);
    expect(indices).toEqual(sorted);
    expect(result.length).toBeGreaterThan(1);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterCommands(COMMANDS, 'zzzzz').length).toBe(0);
  });

  it('leaves commands without keywords matchable by title', () => {
    const noKeyword = [cmd('x', 'Lonely Command', 'Misc')];
    expect(filterCommands(noKeyword, 'lonely').length).toBe(1);
    expect(filterCommands(noKeyword, 'lonely')[0].keywords).toBeUndefined();
  });
});
