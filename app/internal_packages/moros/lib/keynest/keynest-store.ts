import { KeyManager } from 'moros-exports';
import MorosDataStore, { MorosRecord, morosId } from '../moros-data-store';
import { analyzeHealth, HealthSummary } from './password-health';
import { ImportedEntry } from './importers';

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
  /**
   * Whether this entry has a TOTP (2FA) seed stored in the keychain. Only the
   * flag lives in metadata — the base32 seed itself is a secret and is stored
   * exclusively through KeyManager, never written to vault.json.
   */
  totp?: boolean;
}

// KeyNest grew out of the original Vault module — the keychain prefix and the
// data filename are unchanged so existing entries and secrets survive.
function secretKeyName(entryId: string) {
  return `moros-vault-${entryId}`;
}

// TOTP seeds are stored under a distinct keychain key per entry so the primary
// secret (password / API key) and the 2FA seed never collide.
function totpKeyName(entryId: string) {
  return `moros-vault-${entryId}-totp`;
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

  // Write ordering matters in both directions: a crash between the two
  // writes must never leave a *visible* entry whose secret is gone. The
  // failure mode we accept instead is an orphaned keychain value, which is
  // invisible, still encrypted, and overwritten if the id is ever reused.

  async createWithSecret(
    attrs: Omit<KeyNestEntry, 'id' | 'createdAt' | 'updatedAt'>,
    secret: string
  ) {
    const id = morosId();
    // Store the secret first; if the keychain write throws (locked keychain,
    // safeStorage unavailable), no visible entry is ever created.
    await KeyManager.replacePassword(secretKeyName(id), secret);
    const entry = this.create(attrs, id);
    this.flush();
    return entry;
  }

  async getSecret(entryId: string): Promise<string | undefined> {
    return KeyManager.getPassword(secretKeyName(entryId));
  }

  async removeWithSecret(entryId: string) {
    // Remove + durably persist metadata before deleting the keychain secret,
    // so a crash can't leave a visible entry pointing at a deleted secret.
    const removed = this.remove(entryId);
    if (!removed) return undefined;
    this.flush();
    await KeyManager.deletePassword(secretKeyName(entryId));
    // Also clear any TOTP seed — the metadata entry that referenced it is gone.
    if (removed.totp) {
      await KeyManager.deletePassword(totpKeyName(entryId));
    }
    return removed;
  }

  // --- TOTP (2FA) seeds -----------------------------------------------------
  //
  // The seed is a secret, so it follows the same crash-safe ordering as the
  // primary secret: store the seed in the keychain *before* the `totp:true`
  // flag becomes durable, and clear the flag (durably) *before* deleting the
  // keychain seed. The accepted failure mode is an orphaned, still-encrypted
  // keychain value — never a visible flag pointing at a missing seed.

  async setTotpSeed(entryId: string, seedBase32: string) {
    const existing = this.get(entryId);
    if (!existing) return undefined;
    await KeyManager.replacePassword(totpKeyName(entryId), seedBase32);
    const updated = this.update(entryId, { totp: true }) || existing;
    this.flush();
    return updated;
  }

  async getTotpSeed(entryId: string): Promise<string | undefined> {
    return KeyManager.getPassword(totpKeyName(entryId));
  }

  async clearTotpSeed(entryId: string) {
    const existing = this.get(entryId);
    if (!existing) return undefined;
    const updated = this.update(entryId, { totp: false }) || existing;
    this.flush();
    await KeyManager.deletePassword(totpKeyName(entryId));
    return updated;
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
      // Rotate the secret first, then persist metadata, mirroring create.
      await KeyManager.replacePassword(secretKeyName(existing.id), secret);
      const updated = this.update(existing.id, attrs) || existing;
      this.flush();
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

  /**
   * Read every password entry's secret (transiently, from the keychain) and
   * audit it for weak and reused passwords. Secrets are not retained — only
   * the metadata summary is returned. API-key entries are excluded, since the
   * weak/reused heuristics don't apply to them.
   */
  async auditPasswords(): Promise<HealthSummary> {
    const passwordEntries = this.items().filter((entry) => entry.kind === 'password');
    const withSecrets = await Promise.all(
      passwordEntries.map(async (entry) => ({
        entry,
        secret: (await this.getSecret(entry.id)) || '',
      }))
    );
    return analyzeHealth(withSecrets);
  }

  /**
   * Create a password entry for each imported credential, routing its password
   * through the secure KeyManager path exactly like a manual add. The parsed
   * password is held only transiently here and is never written to vault.json
   * or logged. Returns how many entries were imported and how many were
   * skipped (e.g. a keychain write failed). Entries with an empty name are
   * assumed already filtered out by the parser.
   */
  async importEntries(entries: ImportedEntry[]): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    for (const entry of entries) {
      const name = (entry.name || '').trim();
      if (!name) {
        skipped += 1;
        continue;
      }
      try {
        await this.createWithSecret(
          {
            name,
            kind: 'password',
            username: (entry.username || '').trim(),
            url: (entry.url || '').trim(),
            expiresAt: '',
          },
          entry.password || ''
        );
        imported += 1;
      } catch (err) {
        // A single failed keychain write shouldn't abort the whole import;
        // report it (without the secret) and keep going.
        AppEnv.reportError(err);
        skipped += 1;
      }
    }
    return { imported, skipped };
  }
}

export default new KeyNestStore();
