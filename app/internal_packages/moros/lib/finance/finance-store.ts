import MorosDataStore, { MorosRecord, todayISO } from '../moros-data-store';

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

const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

export function formatCents(cents: number) {
  return formatter.format(cents / 100);
}

/** Parse user input like "12.50" or "$1,200" into integer cents. */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.abs(value) * 100);
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
}

export default new FinanceStore();
