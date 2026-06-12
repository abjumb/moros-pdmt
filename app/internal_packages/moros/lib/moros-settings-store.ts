import path from 'path';
import MailspringStore from 'mailspring-store';
import {
  morosDataDirPath,
  readJsonFile,
  watchMorosFile,
  writeJsonFileAtomic,
} from './moros-data-store';

const SETTINGS_FILENAME = 'settings.json';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR'];

interface MorosSettings {
  currency?: string;
}

/** Small persisted key/value settings shared by the Moros modules. */
class MorosSettingsStore extends MailspringStore {
  _settings: MorosSettings;
  _saveTimer: ReturnType<typeof setTimeout> | null = null;
  _selfWriteAtMs = 0;

  constructor() {
    super();
    this._settings = readJsonFile<MorosSettings>(this._filePath()) || {};
    watchMorosFile(SETTINGS_FILENAME, () => {
      if (Date.now() - this._selfWriteAtMs < 1000) return;
      this._settings = readJsonFile<MorosSettings>(this._filePath()) || {};
      this.trigger();
    });
  }

  currency(): string {
    return this._settings.currency || 'USD';
  }

  setCurrency(currency: string) {
    this._settings = { ...this._settings, currency };
    this._queueSave();
    this.trigger();
  }

  _filePath() {
    return path.join(morosDataDirPath(), SETTINGS_FILENAME);
  }

  _queueSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._selfWriteAtMs = Date.now();
      try {
        writeJsonFileAtomic(this._filePath(), this._settings);
      } catch (err) {
        AppEnv.reportError(err);
      }
    }, 250);
  }
}

export default new MorosSettingsStore();
