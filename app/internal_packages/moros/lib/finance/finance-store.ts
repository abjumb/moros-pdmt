import MorosDataStore, { MorosRecord } from '../moros-data-store';

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

export function todayISO() {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
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

  monthTotals(): { incomeCents: number; spendingCents: number } {
    const prefix = todayISO().slice(0, 7);
    let incomeCents = 0;
    let spendingCents = 0;
    for (const t of this.items()) {
      if (!t.date.startsWith(prefix)) continue;
      if (t.kind === 'income') incomeCents += t.amountCents;
      else spendingCents += t.amountCents;
    }
    return { incomeCents, spendingCents };
  }

  sortedByDate(): MorosTransaction[] {
    return [...this.items()].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt
    );
  }
}

export default new FinanceStore();
