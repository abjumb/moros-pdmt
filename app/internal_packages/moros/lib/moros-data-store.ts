import fs from 'fs';
import path from 'path';
import MorosStore from 'moros-store';

export interface MorosRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export function morosId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Today as a local-timezone ISO date (yyyy-mm-dd). */
export function todayISO() {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Directory holding all Moros module JSON files. */
export function morosDataDirPath() {
  return path.join(AppEnv.getConfigDirPath(), 'moros');
}

/**
 * Base class for the Moros module stores. Records live in memory and are
 * persisted as JSON beneath `<config>/moros/`, outside the mail database —
 * the database is owned exclusively by the sync engine and is read-only
 * from the app, so module data must not go through DatabaseStore.
 *
 * Writes are debounced and atomic (temp file + rename) so a crash mid-save
 * can't truncate the data file.
 */
export default class MorosDataStore<T extends MorosRecord> extends MorosStore {
  _filename: string;
  _items: T[];
  _saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filename: string) {
    super();
    this._filename = filename;
    this._items = this._load();
  }

  items(): ReadonlyArray<T> {
    return this._items;
  }

  get(id: string): T | undefined {
    return this._items.find((item) => item.id === id);
  }

  create(attrs: Omit<T, 'id' | 'createdAt' | 'updatedAt'>, presetId?: string): T {
    const now = Date.now();
    const item = { ...attrs, id: presetId || morosId(), createdAt: now, updatedAt: now } as T;
    this._items = [item, ...this._items];
    this._queueSave();
    this.trigger();
    return item;
  }

  update(id: string, attrs: Partial<Omit<T, 'id' | 'createdAt'>>): T | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...attrs, id, updatedAt: Date.now() };
    this._items = this._items.map((item) => (item.id === id ? updated : item));
    this._queueSave();
    this.trigger();
    return updated;
  }

  remove(id: string): T | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    this._items = this._items.filter((item) => item.id !== id);
    this._queueSave();
    this.trigger();
    return existing;
  }

  _filePath() {
    return path.join(morosDataDirPath(), this._filename);
  }

  _load(): T[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this._filePath(), 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      // Missing on first run; if unreadable / corrupt, start empty rather than crash.
      return [];
    }
  }

  /** Persist immediately, bypassing the debounce — for ordering-sensitive writes. */
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
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(tempPath, JSON.stringify(this._items, null, 2), 'utf8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      AppEnv.reportError(err);
    }
  }
}
