/**
 * A single entry in the command palette. `run` performs the command's effect
 * (navigation or a module action). `section` groups related commands in the UI.
 */
export interface PaletteCommand {
  /** Stable, unique identifier (also used as a React key). */
  id: string;
  /** Human-readable, localized label shown in the list. */
  title: string;
  /** Group heading (e.g. 'Navigate', 'Tasks', 'Finance'). */
  section: string;
  /** Optional extra words to match against (kept out of the visible title). */
  keywords?: string;
  /** Side-effecting action invoked when the command is chosen. */
  run: () => void;
}

/**
 * Returns true when every character of `query` appears in `text` in order
 * (a case-insensitive subsequence match). An empty query always matches.
 *
 * Subsequence matching is what makes the palette feel Linear-like: typing
 * "nt" matches "New task" even though the characters aren't adjacent.
 */
export function subsequenceMatch(text: string, query: string): boolean {
  if (!query) return true;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

/**
 * Pure, UI-independent filter for the command palette. Case-insensitive
 * subsequence match against each command's `title` (plus `section` and
 * `keywords`, so "go finance" or a keyword can surface a command). Order is
 * stable: matching commands are returned in their original registry order, so
 * the list never reshuffles unexpectedly as the user types. An empty/whitespace
 * query returns every command unchanged.
 */
export function filterCommands(
  commands: ReadonlyArray<PaletteCommand>,
  query: string
): PaletteCommand[] {
  const trimmed = (query || '').trim();
  if (!trimmed) return commands.slice();
  return commands.filter((command) => {
    const haystack = `${command.title} ${command.section} ${command.keywords || ''}`;
    return subsequenceMatch(haystack, trimmed);
  });
}
