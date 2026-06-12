import MorosDataStore, { MorosRecord, todayISO } from '../moros-data-store';

export { formatCents, parseAmountToCents } from '../finance/finance-store';

export type SubscriptionCadence = 'weekly' | 'monthly' | 'yearly';
export type SubscriptionStatus = 'active' | 'trial' | 'canceled';

export const SUBSCRIPTION_CATEGORIES = [
  'Streaming',
  'Software',
  'Music',
  'News',
  'Fitness',
  'Utilities',
  'Other',
];

export const CADENCE_LABELS: { [K in SubscriptionCadence]: string } = {
  weekly: '/wk',
  monthly: '/mo',
  yearly: '/yr',
};

export interface MorosSubscription extends MorosRecord {
  name: string;
  /** Billing sender address, used for detection dedupe and cancel drafts. */
  vendorEmail: string;
  /** Amount charged per billing period, in integer cents — always positive. */
  amountCents: number;
  cadence: SubscriptionCadence;
  /** ISO date (yyyy-mm-dd) of the next expected charge, or '' when unknown. */
  nextRenewal: string;
  category: string;
  status: SubscriptionStatus;
  source: 'manual' | 'detected';
}

const WEEKS_PER_MONTH = 52 / 12;

/** Per-month cost of a subscription, normalized across cadences. */
export function monthlyCents(sub: Pick<MorosSubscription, 'amountCents' | 'cadence'>): number {
  switch (sub.cadence) {
    case 'weekly':
      return Math.round(sub.amountCents * WEEKS_PER_MONTH);
    case 'yearly':
      return Math.round(sub.amountCents / 12);
    default:
      return sub.amountCents;
  }
}

/** Per-year cost of a subscription, normalized across cadences. */
export function yearlyCents(sub: Pick<MorosSubscription, 'amountCents' | 'cadence'>): number {
  switch (sub.cadence) {
    case 'weekly':
      return sub.amountCents * 52;
    case 'monthly':
      return sub.amountCents * 12;
    default:
      return sub.amountCents;
  }
}

/**
 * Whole days from `fromISO` (default: today) until `dateISO`.
 * Negative when the date has passed.
 */
export function daysUntil(dateISO: string, fromISO = todayISO()): number {
  const target = new Date(`${dateISO}T00:00:00`);
  const from = new Date(`${fromISO}T00:00:00`);
  return Math.round((target.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

class SubscriptionsStore extends MorosDataStore<MorosSubscription> {
  constructor() {
    super('subscriptions.json');
  }

  active(): MorosSubscription[] {
    return this.items().filter((sub) => sub.status !== 'canceled');
  }

  totalMonthlyCents(): number {
    return this.active().reduce((sum, sub) => sum + monthlyCents(sub), 0);
  }

  totalYearlyCents(): number {
    return this.active().reduce((sum, sub) => sum + yearlyCents(sub), 0);
  }

  /** Active subscriptions renewing within `withinDays`, soonest first. */
  renewingSoon(withinDays = 30): MorosSubscription[] {
    return this.active()
      .filter((sub) => {
        if (!sub.nextRenewal) return false;
        const days = daysUntil(sub.nextRenewal);
        return days >= 0 && days <= withinDays;
      })
      .sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal));
  }

  /** Lowercased vendor emails already tracked — used to filter suggestions. */
  trackedVendorEmails(): Set<string> {
    const emails = new Set<string>();
    for (const sub of this.items()) {
      if (sub.vendorEmail) emails.add(sub.vendorEmail.toLowerCase());
    }
    return emails;
  }
}

export default new SubscriptionsStore();
