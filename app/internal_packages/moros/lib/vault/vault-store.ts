import { KeyManager } from 'mailspring-exports';
import MorosDataStore, { MorosRecord, morosId } from '../moros-data-store';

export type VaultEntryKind = 'password' | 'api-key';

/**
 * Vault entry metadata. The secret value itself is intentionally NOT part of
 * this record: it never touches the JSON file. Secrets are stored through
 * KeyManager, which encrypts them with Electron safeStorage (OS keychain).
 */
export interface VaultEntry extends MorosRecord {
  name: string;
  kind: VaultEntryKind;
  username: string;
  url: string;
}

function secretKeyName(entryId: string) {
  return `moros-vault-${entryId}`;
}

class VaultStore extends MorosDataStore<VaultEntry> {
  constructor() {
    super('vault.json');
  }

  // Write ordering matters in both directions: a crash between the two
  // writes must never leave a *visible* entry whose secret is gone. The
  // failure mode we accept instead is an orphaned keychain value, which is
  // invisible, still encrypted, and overwritten if the id is ever reused.

  async createWithSecret(
    attrs: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>,
    secret: string
  ) {
    const id = morosId();
    await KeyManager.replacePassword(secretKeyName(id), secret);
    const entry = this.create(attrs, id);
    this.flush();
    return entry;
  }

  async getSecret(entryId: string): Promise<string | undefined> {
    return KeyManager.getPassword(secretKeyName(entryId));
  }

  async removeWithSecret(entryId: string) {
    const removed = this.remove(entryId);
    if (!removed) return undefined;
    this.flush();
    await KeyManager.deletePassword(secretKeyName(entryId));
    return removed;
  }
}

export default new VaultStore();
