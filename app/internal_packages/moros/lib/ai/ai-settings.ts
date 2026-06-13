import fs from 'fs';
import path from 'path';
import MorosStore from 'moros-store';
import { AiProviderId, DEFAULT_MODEL } from './ai-providers';

export interface AiSettings {
  provider: AiProviderId;
  model: string;
}

const DEFAULT_SETTINGS: AiSettings = { provider: 'byok', model: DEFAULT_MODEL };

/**
 * One place to choose how Moros talks to an LLM — bring-your-own-key or the
 * hosted Moros plan — shared by every AI feature (Briefing and subscription
 * detection). Persisted as JSON beside the other Moros data files rather than
 * in AppEnv.config, which is reserved for schema-backed core settings.
 */
class AiSettingsStore extends MorosStore {
  _settings: AiSettings;

  constructor() {
    super();
    this._settings = this._load();
  }

  _filePath() {
    return path.join(AppEnv.getConfigDirPath(), 'moros', 'ai-settings.json');
  }

  _load(): AiSettings {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._filePath(), 'utf8'));
      const provider: AiProviderId = parsed.provider === 'hosted' ? 'hosted' : 'byok';
      const model = typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL;
      return { provider, model };
    } catch (err) {
      // Missing on first run; if unreadable, fall back to defaults.
      return { ...DEFAULT_SETTINGS };
    }
  }

  _save() {
    const filePath = this._filePath();
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(this._settings, null, 2), 'utf8');
    } catch (err) {
      AppEnv.reportError(err);
    }
  }

  settings(): AiSettings {
    return { ...this._settings };
  }

  setProvider(provider: AiProviderId) {
    if (this._settings.provider === provider) return;
    this._settings = { ...this._settings, provider };
    this._save();
    this.trigger();
  }

  setModel(model: string) {
    if (this._settings.model === model) return;
    this._settings = { ...this._settings, model };
    this._save();
    this.trigger();
  }
}

export default new AiSettingsStore();
