// Import the functions under test directly from the source files.
// We use relative paths because the plugin is not registered in moros-exports.
import {
  daysUntil,
  monthlyCents,
  yearlyCents,
} from '../internal_packages/moros/lib/subscriptions/subscriptions-store';
import {
  detectCandidates,
  vendorNameFromEmail,
} from '../internal_packages/moros/lib/subscriptions/subscription-detector';
import { expiryState } from '../internal_packages/moros/lib/keynest/keynest-store';

describe('Moros subscriptions math', () => {
  it('normalizes cadences to a monthly cost', () => {
    expect(monthlyCents({ amountCents: 1000, cadence: 'monthly' })).toBe(1000);
    expect(monthlyCents({ amountCents: 12000, cadence: 'yearly' })).toBe(1000);
    // 52 weeks / 12 months — $10/week ≈ $43.33/month
    expect(monthlyCents({ amountCents: 1000, cadence: 'weekly' })).toBe(4333);
  });

  it('normalizes cadences to a yearly cost', () => {
    expect(yearlyCents({ amountCents: 1000, cadence: 'monthly' })).toBe(12000);
    expect(yearlyCents({ amountCents: 12000, cadence: 'yearly' })).toBe(12000);
    expect(yearlyCents({ amountCents: 1000, cadence: 'weekly' })).toBe(52000);
  });

  it('computes whole days until a renewal date', () => {
    expect(daysUntil('2026-06-22', '2026-06-12')).toBe(10);
    expect(daysUntil('2026-06-12', '2026-06-12')).toBe(0);
    expect(daysUntil('2026-06-01', '2026-06-12')).toBe(-11);
    // Across a month boundary
    expect(daysUntil('2026-07-02', '2026-06-30')).toBe(2);
  });
});

describe('Moros subscription detection', () => {
  const receipt = (
    subject: string,
    fromEmail = 'billing@netflix.com',
    fromName = 'Netflix'
  ) => ({ subject, fromEmail, fromName });

  it('detects receipt-shaped subjects and extracts the amount', () => {
    const candidates = detectCandidates([
      receipt('Your Netflix receipt — $15.49'),
      receipt('Lunch on Saturday?', 'friend@example.com', 'A Friend'),
    ]);
    expect(candidates.length).toBe(1);
    expect(candidates[0].vendorEmail).toBe('billing@netflix.com');
    expect(candidates[0].name).toBe('Netflix');
    expect(candidates[0].amountCents).toBe(1549);
    expect(candidates[0].cadence).toBe('monthly');
  });

  it('guesses a yearly cadence from the subject', () => {
    const [candidate] = detectCandidates([
      receipt('Receipt: your annual plan renewal — $120.00', 'billing@example.com', ''),
    ]);
    expect(candidate.cadence).toBe('yearly');
    expect(candidate.amountCents).toBe(12000);
  });

  it('parses amounts with thousands separators', () => {
    const [candidate] = detectCandidates([
      receipt('Invoice for your subscription: $1,200.00', 'ar@bigcorp.com', 'BigCorp'),
    ]);
    expect(candidate.amountCents).toBe(120000);
  });

  it('returns one candidate per sender and backfills the amount', () => {
    const candidates = detectCandidates([
      receipt('Your subscription is renewing soon'),
      receipt('Your Netflix receipt — $15.49'),
    ]);
    expect(candidates.length).toBe(1);
    expect(candidates[0].amountCents).toBe(1549);
  });

  it('excludes senders that are already tracked', () => {
    const candidates = detectCandidates(
      [receipt('Your Netflix receipt — $15.49')],
      new Set(['billing@netflix.com'])
    );
    expect(candidates.length).toBe(0);
  });

  it('falls back to a vendor name derived from the sender domain', () => {
    const [candidate] = detectCandidates([
      receipt('Payment received — thanks!', 'no-reply@mail.spotify.com', ''),
    ]);
    expect(candidate.name).toBe('Spotify');
  });

  it('derives vendor names from sender domains', () => {
    expect(vendorNameFromEmail('billing@netflix.com')).toBe('Netflix');
    expect(vendorNameFromEmail('no-reply@mail.spotify.com')).toBe('Spotify');
  });
});

describe('Moros KeyNest expiry state', () => {
  const now = new Date('2026-06-12T12:00:00');

  it('treats entries without an expiration as ok', () => {
    expect(expiryState({ expiresAt: '' }, now)).toBe('ok');
  });

  it('flags entries expiring within the warning window', () => {
    expect(expiryState({ expiresAt: '2026-06-20' }, now)).toBe('expiring-soon');
    expect(expiryState({ expiresAt: '2026-06-12' }, now)).toBe('expiring-soon');
  });

  it('flags entries past their expiration', () => {
    expect(expiryState({ expiresAt: '2026-06-11' }, now)).toBe('expired');
  });

  it('treats entries expiring beyond the window as ok', () => {
    expect(expiryState({ expiresAt: '2026-12-31' }, now)).toBe('ok');
  });
});
