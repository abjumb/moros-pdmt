import MorosDataStore, { MorosRecord, todayISO } from '../moros-data-store';
import MorosSettingsStore from '../moros-settings-store';

export { todayISO };

export type TransactionKind = 'expense' | 'income';

export const CATEGORIES = [
  'General',
  'Food',
  'Housing',
  'Transport',
  'Subscriptions',
  'Health',
  'Salary',
  'Other',
];

export interface MorosTransaction extends MorosRecord {
  description: string;
  category: string;
  kind: TransactionKind;
  /** Amount in integer cents — always positive; `kind` carries the sign. */
  amountCents: number;
  /** ISO date (yyyy-mm-dd) the transaction occurred. */
  date: string;
}

// Formatters are cached per configured currency (see MorosSettingsStore —
// the currency is user-selectable in the Finance header, defaulting to USD).
const formatters = new Map<string, Intl.NumberFormat>();

export function formatCents(cents: number) {
  const currency = MorosSettingsStore.currency();
  let formatter = formatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    } catch (err) {
      formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    formatters.set(currency, formatter);
  }
  return formatter.format(cents / 100);
}

/**
 * Parse user input like "12.50", "$1,200" or "1.200,50" into integer cents.
 * Both `.` and `,` are accepted as decimal or thousands separators: when both
 * appear, the last one wins as the decimal point; a lone `,` or `.` is a
 * decimal point only when followed by 1-2 trailing digits.
 */
export function parseAmountToCents(input: string): number | null {
  let normalized = input.replace(/[^0-9.,]/g, '');
  if (!normalized) return null;

  const lastDot = normalized.lastIndexOf('.');
  const lastComma = normalized.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    normalized = normalized.split(thousandsSep).join('');
    normalized = normalized.replace(decimalSep, '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const isDecimal = new RegExp(`\\${sep}\\d{1,2}$`).test(normalized);
    normalized = normalized.split(sep).join(isDecimal ? '#' : '');
    normalized = normalized.replace('#', '.');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * Per-category spending vs. budget for a single month. A pure, testable
 * summary the month view renders as a progress bar. `spentCents` and
 * `budgetCents` are integer cents; `ratio` is spent/budget (0 when there is
 * no budget) and `overBudget` is true once spending exceeds the budget.
 */
export interface CategoryBudgetSummary {
  category: string;
  spentCents: number;
  budgetCents: number;
  ratio: number;
  overBudget: boolean;
}

/**
 * Build the spent-vs-budget summary for a month. Pure: callers pass the
 * month's transactions and the budget map so the math is unit-testable
 * without the singleton stores. Categories with either spending or a budget
 * are returned, ordered like CATEGORIES (unknown categories appended).
 */
export function budgetSummary(
  transactions: ReadonlyArray<Pick<MorosTransaction, 'category' | 'kind' | 'amountCents'>>,
  budgets: { [category: string]: number }
): CategoryBudgetSummary[] {
  const spentByCategory: { [category: string]: number } = {};
  for (const t of transactions) {
    if (t.kind !== 'expense') continue;
    spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amountCents;
  }

  const categories = [
    ...CATEGORIES,
    ...Object.keys(spentByCategory).filter((c) => !CATEGORIES.includes(c)),
    ...Object.keys(budgets).filter((c) => !CATEGORIES.includes(c) && !(c in spentByCategory)),
  ];
  const seen = new Set<string>();

  const summaries: CategoryBudgetSummary[] = [];
  for (const category of categories) {
    if (seen.has(category)) continue;
    seen.add(category);
    const spentCents = spentByCategory[category] || 0;
    const budgetCents = budgets[category] || 0;
    if (spentCents === 0 && budgetCents === 0) continue;
    summaries.push({
      category,
      spentCents,
      budgetCents,
      ratio: budgetCents > 0 ? spentCents / budgetCents : 0,
      overBudget: budgetCents > 0 && spentCents > budgetCents,
    });
  }
  return summaries;
}

export interface ParsedCsvRow {
  description: string;
  amountCents: number;
  kind: TransactionKind;
  category: string;
  date: string;
}

export interface ParsedCsvResult {
  rows: ParsedCsvRow[];
  /** Count of rows skipped because they were malformed or unparseable. */
  skipped: number;
}

/** Split a single CSV line, honoring double-quoted fields and "" escapes. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

/**
 * Parse a transactions CSV into rows ready for FinanceStore.create(). Pure and
 * unit-testable independent of any file dialog.
 *
 * Expected columns (matched case-insensitively from a header row if present,
 * otherwise positional: date, description, amount, category): `date`,
 * `description`, `amount`, optional `category`. A negative amount (or a `kind`
 * column of "income") marks income; amounts are stored as positive integer
 * cents with `kind` carrying the sign, matching the manual-entry convention.
 * Malformed rows (missing date/description/amount or an unparseable amount)
 * are skipped and counted rather than throwing.
 */
export function parseTransactionsCsv(text: string): ParsedCsvResult {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '');
  const rows: ParsedCsvRow[] = [];
  let skipped = 0;
  if (lines.length === 0) return { rows, skipped };

  // Detect a header row by looking for known column names.
  const firstCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const headerKeywords = ['date', 'description', 'amount', 'category', 'kind', 'desc', 'memo'];
  const hasHeader = firstCells.some((c) => headerKeywords.includes(c));

  let idx = { date: 0, description: 1, amount: 2, category: 3, kind: -1 };
  if (hasHeader) {
    const find = (...names: string[]) => firstCells.findIndex((c) => names.includes(c));
    idx = {
      date: find('date'),
      description: find('description', 'desc', 'memo'),
      amount: find('amount', 'value'),
      category: find('category'),
      kind: find('kind', 'type'),
    };
  }

  const dataLines = hasHeader ? lines.slice(1) : lines;
  for (const line of dataLines) {
    const cells = splitCsvLine(line);
    const cell = (i: number) => (i >= 0 && i < cells.length ? cells[i] : '');

    const date = cell(idx.date);
    const description = cell(idx.description);
    const rawAmount = cell(idx.amount);
    if (!date || !description || !rawAmount) {
      skipped++;
      continue;
    }

    const amountCents = parseAmountToCents(rawAmount);
    if (amountCents === null || amountCents === 0) {
      skipped++;
      continue;
    }

    // Sign comes from a leading minus or an explicit "income"/"expense" kind.
    const kindCell = cell(idx.kind).toLowerCase();
    let kind: TransactionKind;
    if (kindCell === 'income' || kindCell === 'expense') {
      kind = kindCell;
    } else {
      kind = /-/.test(rawAmount) ? 'income' : 'expense';
    }
    // amountCents is always positive (sign carried by `kind`).
    const positiveCents = Math.abs(amountCents);

    const category = cell(idx.category) || CATEGORIES[0];
    rows.push({ description, amountCents: positiveCents, kind, category, date });
  }

  return { rows, skipped };
}

/** Current month as a 'yyyy-mm' prefix. */
export function currentMonthPrefix() {
  return todayISO().slice(0, 7);
}

/** Shift a 'yyyy-mm' prefix by a number of months (negative = earlier). */
export function shiftMonthPrefix(prefix: string, delta: number) {
  const [year, month] = prefix.split('-').map(Number);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${`${shifted.getMonth() + 1}`.padStart(2, '0')}`;
}

/** Human label for a 'yyyy-mm' prefix, e.g. "June 2026". */
export function monthPrefixLabel(prefix: string) {
  const [year, month] = prefix.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

class FinanceStore extends MorosDataStore<MorosTransaction> {
  constructor() {
    super('transactions.json');
  }

  signedCents(t: MorosTransaction) {
    return t.kind === 'income' ? t.amountCents : -t.amountCents;
  }

  balanceCents() {
    return this.items().reduce((sum, t) => sum + this.signedCents(t), 0);
  }

  monthTotals(monthPrefix: string): { incomeCents: number; spendingCents: number } {
    let incomeCents = 0;
    let spendingCents = 0;
    for (const t of this.items()) {
      if (!t.date.startsWith(monthPrefix)) continue;
      if (t.kind === 'income') incomeCents += t.amountCents;
      else spendingCents += t.amountCents;
    }
    return { incomeCents, spendingCents };
  }

  /** Transactions newest-first, optionally restricted to a 'yyyy-mm' month. */
  sortedByDate(monthPrefix: string | null = null): MorosTransaction[] {
    const filtered = monthPrefix
      ? this.items().filter((t) => t.date.startsWith(monthPrefix))
      : [...this.items()];
    return filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  /**
   * Daily running-balance series ending today, for the net worth chart.
   * `daysBack = null` spans from the earliest transaction. Days without
   * transactions carry the previous balance forward, Origin-style.
   */
  balanceSeries(daysBack: number | null): { date: string; cents: number }[] {
    const byDate = new Map<string, number>();
    for (const t of this.items()) {
      byDate.set(t.date, (byDate.get(t.date) || 0) + this.signedCents(t));
    }
    const allDates = [...byDate.keys()].sort();
    const today = todayISO();

    const isoFromDate = (d: Date) =>
      `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;

    let startDate: string;
    if (daysBack !== null) {
      const start = new Date();
      start.setDate(start.getDate() - (daysBack - 1));
      startDate = isoFromDate(start);
    } else {
      startDate = allDates[0] || today;
    }

    // Balance accumulated before the window opens.
    let runningCents = 0;
    for (const date of allDates) {
      if (date < startDate) runningCents += byDate.get(date);
    }

    const series: { date: string; cents: number }[] = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    let iso = startDate;
    // Guard against pathological ranges so the loop always terminates.
    let guard = 0;
    while (iso <= today && guard < 4000) {
      runningCents += byDate.get(iso) || 0;
      series.push({ date: iso, cents: runningCents });
      cursor.setDate(cursor.getDate() + 1);
      iso = isoFromDate(cursor);
      guard += 1;
    }
    return series;
  }
}

export default new FinanceStore();
