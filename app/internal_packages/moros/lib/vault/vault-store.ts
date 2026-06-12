import { KeyManager } from 'mailspring-exports';
import MorosDataStore, { MorosRecord } from '../moros-data-store';

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

  async createWithSecret(
    attrs: Omit<VaultEntry, 'id' | 'createdAt' | 'updatedAt'>,
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
}

export default new VaultStore();
