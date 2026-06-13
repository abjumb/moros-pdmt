import type { KeyNestEntry } from './keynest-store';
import { isWeak } from './password-strength';

export interface HealthEntry {
  entry: KeyNestEntry;
  weak: boolean;
  reused: boolean;
}

export interface HealthSummary {
  entries: HealthEntry[];
  weakCount: number;
  reusedCount: number;
  checked: number;
}

/**
 * Audit a set of entries paired with their (transiently read) secrets for two
 * classic password-hygiene problems: weak secrets and secrets reused across
 * more than one entry. Pure function — the secrets are inspected to compute
 * flags but never returned, so callers can render the summary without holding
 * plaintext. Empty secrets are ignored for both checks.
 */
export function analyzeHealth(
  items: Array<{ entry: KeyNestEntry; secret: string }>
): HealthSummary {
  const counts = new Map<string, number>();
  for (const { secret } of items) {
    if (secret.length === 0) continue;
    counts.set(secret, (counts.get(secret) || 0) + 1);
  }

  const entries: HealthEntry[] = items.map(({ entry, secret }) => ({
    entry,
    weak: secret.length > 0 && isWeak(secret),
    reused: secret.length > 0 && (counts.get(secret) || 0) > 1,
  }));

  return {
    entries,
    weakCount: entries.filter((e) => e.weak).length,
    reusedCount: entries.filter((e) => e.reused).length,
    // Only entries with a stored secret are actually evaluated; counting
    // empty-secret entries here would overstate what was checked.
    checked: items.filter((item) => item.secret.length > 0).length,
  };
}
