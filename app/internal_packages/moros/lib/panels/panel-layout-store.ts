import path from 'path';
import fs from 'fs';
import MorosStore from 'moros-store';
import { morosDataDirPath } from '../moros-data-store';
import { PanelLayout, mergeDefaults } from './panel-layout';

const LAYOUTS_FILENAME = 'panel-layouts.json';

/** Persisted map of `moduleId -> PanelLayout`. */
interface PanelLayoutsFile {
  [moduleId: string]: PanelLayout;
}

/**
 * Persists the per-module tiling-panel layouts to `panel-layouts.json` beneath
 * `<config>/moros/`, outside the (read-only) mail database — the same home and
 * the same debounced atomic-write discipline as the other Moros stores.
 *
 * The file is a single keyed blob (`moduleId -> PanelLayout`) rather than a list
 * of records, so this mirrors `MorosSettingsStore`'s shape (a `MorosStore` over
 * a keyed object) instead of the record-list `MorosDataStore`.
 */
class PanelLayoutStore extends MorosStore {
  _layouts: PanelLayoutsFile;
  _saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this._layouts = this._load();
  }

  /**
   * The persisted layout for a module reconciled against its current panel set.
   * New panels are appended and removed ones dropped, so callers always receive
   * a layout describing exactly `defaultPanelIds`.
   */
  forModule(moduleId: string, defaultPanelIds: string[]): PanelLayout {
    return mergeDefaults(this._layouts[moduleId], defaultPanelIds);
  }

  /** Persist a module's layout and notify listeners. */
  save(moduleId: string, layout: PanelLayout) {
    this._layouts = { ...this._layouts, [moduleId]: layout };
    this._queueSave();
    this.trigger();
  }

  _filePath() {
    return path.join(morosDataDirPath(), LAYOUTS_FILENAME);
  }

  _load(): PanelLayoutsFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._filePath(), 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
      // Missing on first run; corrupt/unreadable starts empty rather than crash.
      return {};
    }
  }

  _queueSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._save(), 250);
  }

  _save() {
    this._saveTimer = null;
    const filePath = this._filePath();
    const tempPath = `${filePath}.tmp`;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(tempPath, JSON.stringify(this._layouts, null, 2), 'utf8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      AppEnv.reportError(err);
    }
  }

  /** Clear all in-memory layouts. Used to reset the singleton in specs. */
  _reset() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this._layouts = {};
  }
}

export default new PanelLayoutStore();
