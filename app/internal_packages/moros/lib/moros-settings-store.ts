import path from 'path';
import fs from 'fs';
import MailspringStore from 'mailspring-store';
import { morosDataDirPath } from './moros-data-store';

const SETTINGS_FILENAME = 'settings.json';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR'];

interface MorosSettings {
  currency?: string;
}

/** Small persisted key/value settings shared by the Moros modules. */
class MorosSettingsStore extends MailspringStore {
  _settings: MorosSettings;
  _saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this._settings = this._load();
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

  _load(): MorosSettings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._filePath(), 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  _queueSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      const filePath = this._filePath();
      const tempPath = `${filePath}.tmp`;
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(tempPath, JSON.stringify(this._settings, null, 2), 'utf8');
        fs.renameSync(tempPath, filePath);
      } catch (err) {
        AppEnv.reportError(err);
      }
    }, 250);
  }
}

export default new MorosSettingsStore();
