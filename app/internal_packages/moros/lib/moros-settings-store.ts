import path from 'path';
import fs from 'fs';
import MorosStore from 'moros-store';
import { morosDataDirPath } from './moros-data-store';
import MorosFileWatch from './moros-file-watch';

const SETTINGS_FILENAME = 'settings.json';

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'INR'];

interface MorosSettings {
  currency?: string;
}

/** Small persisted key/value settings shared by the Moros modules. */
class MorosSettingsStore extends MorosStore {
  _settings: MorosSettings;
  _saveTimer: ReturnType<typeof setTimeout> | null = null;
  // Cross-window live sync, mirroring MorosDataStore (see moros-file-watch.ts).
  _watch: MorosFileWatch;

  constructor() {
    super();
    this._settings = this._load();
    this._watch = new MorosFileWatch(this._filePath(), (content) =>
      this._onExternalChange(content)
    );
    this._startWatching();
  }

  _startWatching() {
    const enabled = !(typeof AppEnv !== 'undefined' && AppEnv.inSpecMode && AppEnv.inSpecMode());
    this._watch.start(enabled);
  }

  _onExternalChange(content: string) {
    // Flush a pending local change (last-writer-wins) rather than adopting the
    // external file and then clobbering it when our debounce fires — which
    // would drop the pending edit (e.g. a just-picked currency).
    if (this._saveTimer) {
      this.flush();
      return;
    }
    try {
      const parsed = JSON.parse(content);
      this._settings = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      return;
    }
    this.trigger();
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

  /** Persist immediately, bypassing the debounce. */
  flush() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._save();
  }

  _queueSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 250);
  }

  _save() {
    this._saveTimer = null;
    const filePath = this._filePath();
    const tempPath = `${filePath}.tmp`;
    const content = JSON.stringify(this._settings, null, 2);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(tempPath, content, 'utf8');
      fs.renameSync(tempPath, filePath);
      // Mark the self-write only after a successful save (a failed write must
      // not poison suppression of later external changes).
      this._watch.noteWrite(content);
      this._startWatching();
    } catch (err) {
      AppEnv.reportError(err);
    }
  }

  /** Flush any pending save, then stop watching. Call on package deactivate. */
  dispose() {
    // Persist a pending settings change (e.g. a just-picked currency) before
    // tearing down, so it isn't dropped. flush() clears the timer and writes.
    if (this._saveTimer) this.flush();
    this._watch.stop();
  }
}

export default new MorosSettingsStore();
