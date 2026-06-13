import { DatabaseStore, Message } from 'mailspring-exports';
import { SubscriptionCadence } from './subscriptions-store';

/** The subset of a message the detector needs — kept flat so it's testable. */
export interface DetectionInput {
  subject: string;
  fromEmail: string;
  fromName: string;
}

export interface SubscriptionCandidate {
  name: string;
  vendorEmail: string;
  /** Parsed from the subject when present; null when no amount was found. */
  amountCents: number | null;
  cadence: SubscriptionCadence;
}

const SCAN_WINDOW_DAYS = 90;
const SCAN_MESSAGE_LIMIT = 500;

const RECEIPT_SUBJECT =
  /\b(receipt|invoice|subscription|renew(?:al|ed|s)?|payment (?:received|confirmation|successful)|your (?:plan|membership|trial))\b/i;
const AMOUNT = /(?:\$|usd\s?)\s?(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/i;
const YEARLY = /\b(annual(?:ly)?|year(?:ly)?)\b|\/\s?yr\b/i;
const WEEKLY = /\bweek(?:ly)?\b|\/\s?wk\b/i;

/** 'billing@mail.netflix.com' → 'Netflix'. Fallback vendor name from a sender address. */
export function vendorNameFromEmail(email: string): string {
  const domain = email.split('@')[1] || '';
  const labels = domain.split('.').filter(Boolean);
  // Use the second-level label ('netflix' in 'mail.netflix.com').
  const label = labels.length >= 2 ? labels[labels.length - 2] : labels[0] || email;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Find likely subscriptions in a set of messages, by receipt/renewal-shaped
 * subject lines. One candidate per sender address; an amount seen in any of
 * the sender's subjects wins over none.
 */
export function detectCandidates(
  messages: DetectionInput[],
  excludeEmails: Set<string> = new Set()
): SubscriptionCandidate[] {
  const byEmail = new Map<string, SubscriptionCandidate>();
  for (const message of messages) {
    const email = (message.fromEmail || '').toLowerCase();
    if (!email || excludeEmails.has(email)) continue;
    const subject = message.subject || '';
    if (!RECEIPT_SUBJECT.test(subject)) continue;

    const amountMatch = subject.match(AMOUNT);
    const amountCents = amountMatch
      ? Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100)
      : null;
    const cadence: SubscriptionCadence = YEARLY.test(subject)
      ? 'yearly'
      : WEEKLY.test(subject)
        ? 'weekly'
        : 'monthly';

    const existing = byEmail.get(email);
    if (existing) {
      if (existing.amountCents === null && amountCents !== null) {
        existing.amountCents = amountCents;
        existing.cadence = cadence;
      }
      continue;
    }
    byEmail.set(email, {
      name: message.fromName || vendorNameFromEmail(email),
      vendorEmail: email,
      amountCents,
      cadence,
    });
  }
  return [...byEmail.values()];
}

/**
 * Scan recently received mail for subscription receipts. Read-only database
 * query — candidates only become tracked subscriptions when the user
 * confirms them in the UI.
 */
export async function scanRecentMessages(
  excludeEmails: Set<string>
): Promise<SubscriptionCandidate[]> {
  const since = new Date(Date.now() - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const messages = await DatabaseStore.findAll<Message>(Message)
    .where(Message.attributes.date.greaterThan(since))
    .order(Message.attributes.date.descending())
    .limit(SCAN_MESSAGE_LIMIT);

  const inputs: DetectionInput[] = messages
    .filter((message) => !message.draft && !message.isFromMe())
    .map((message) => ({
      subject: message.subject || '',
      fromEmail: (message.from[0] && message.from[0].email) || '',
      fromName: (message.from[0] && message.from[0].name) || '',
    }));
  return detectCandidates(inputs, excludeEmails);
}
