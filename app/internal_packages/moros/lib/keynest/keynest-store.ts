import { KeyManager } from 'mailspring-exports';
import MorosDataStore, { MorosRecord } from '../moros-data-store';

export type KeyNestEntryKind = 'password' | 'api-key';

/**
 * Well-known entry name other Moros modules use to look up the user's
 * Anthropic API key (e.g. the Briefing module's bring-your-own-key mode).
 * Keeping all credentials in KeyNest means there is exactly one place
 * secrets live and one UI to manage them.
 */
export const ANTHROPIC_KEY_ENTRY_NAME = 'Anthropic API Key';

/** Entries expiring within this many days are flagged in the UI. */
export const EXPIRING_SOON_DAYS = 14;

export type ExpiryState = 'ok' | 'expiring-soon' | 'expired';

/**
 * KeyNest entry metadata. The secret value itself is intentionally NOT part
 * of this record: it never touches the JSON file. Secrets are stored through
 * KeyManager, which encrypts them with Electron safeStorage (OS keychain).
 */
export interface KeyNestEntry extends MorosRecord {
  name: string;
  kind: KeyNestEntryKind;
  username: string;
  url: string;
  /** ISO date (yyyy-mm-dd) the credential expires, or '' when it doesn't. */
  expiresAt: string;
}

// KeyNest grew out of the original Vault module — the keychain prefix and the
// data filename are unchanged so existing entries and secrets survive.
function secretKeyName(entryId: string) {
  return `moros-vault-${entryId}`;
}

export function expiryState(entry: Pick<KeyNestEntry, 'expiresAt'>, now = new Date()): ExpiryState {
  if (!entry.expiresAt) return 'ok';
  // End-of-day local time, so an entry expiring "today" is still usable today.
  const expires = new Date(`${entry.expiresAt}T23:59:59`);
  if (Number.isNaN(expires.getTime())) return 'ok';
  if (expires.getTime() < now.getTime()) return 'expired';
  const soonCutoff = now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  return expires.getTime() <= soonCutoff ? 'expiring-soon' : 'ok';
}

class KeyNestStore extends MorosDataStore<KeyNestEntry> {
  constructor() {
    super('vault.json');
  }

  async createWithSecret(
    attrs: Omit<KeyNestEntry, 'id' | 'createdAt' | 'updatedAt'>,
    secret: string
  ) {
    const entry = this.create(attrs);
    await KeyManager.replacePassword(secretKeyName(entry.id), secret);
    return entry;
  }

  async getSecret(entryId: string): Promise<string | undefined> {
    return KeyManager.getPassword(secretKeyName(entryId));
  }

  async removeWithSecret(entryId: string) {
    await KeyManager.deletePassword(secretKeyName(entryId));
    return this.remove(entryId);
  }

  findByName(name: string): KeyNestEntry | undefined {
    const lower = name.toLowerCase();
    return this.items().find((entry) => entry.name.toLowerCase() === lower);
  }

  /**
   * Create the named entry, or replace the secret of the existing one.
   * Used by other Moros modules (e.g. Briefing) so the credentials they
   * collect are visible and manageable from the KeyNest window.
   */
  async upsertSecretByName(
    name: string,
    attrs: Partial<Omit<KeyNestEntry, 'id' | 'createdAt' | 'updatedAt' | 'name'>>,
    secret: string
  ) {
    const existing = this.findByName(name);
    if (existing) {
      const updated = this.update(existing.id, attrs) || existing;
      await KeyManager.replacePassword(secretKeyName(existing.id), secret);
      return updated;
    }
    return this.createWithSecret(
      { name, kind: 'api-key', username: '', url: '', expiresAt: '', ...attrs },
      secret
    );
  }

  async getSecretByName(name: string): Promise<string | undefined> {
    const entry = this.findByName(name);
    return entry ? this.getSecret(entry.id) : undefined;
  }
}

export default new KeyNestStore();
