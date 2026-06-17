import fs from 'fs';

/**
 * Watches a single JSON data file and invokes a callback when it changes on
 * disk *because of another process* (i.e. another window). This is the
 * cross-window live-sync primitive for the Moros module stores: every window
 * has its own store instance reading the same `<config>/moros/*.json` file, so
 * when one window writes, the others re-read and re-render.
 *
 * Why file-watching (rather than `action-bridge`): the stores are already
 * file-backed and each window loads them independently, so watching the file
 * makes *every* window — main and widget popouts alike — converge with no extra
 * message plumbing, and it also survives the writing window being closed.
 *
 * Avoiding self-write loops: the store calls `noteWrite(content)` with the
 * exact string it just wrote before every save. When the watcher fires, it
 * reads the file and compares it to the last string we wrote; if they match,
 * it's our own write echoing back and we ignore it. Otherwise it's an external
 * change and we reload. The comparison is the full serialized JSON, so it is
 * robust to mtime quirks and to the atomic temp-file+rename used by the stores.
 */
export default class MorosFileWatch {
  private _filePath: string;
  private _onExternalChange: (content: string) => void;
  private _watcher: fs.FSWatcher | null = null;
  private _reloadTimer: ReturnType<typeof setTimeout> | null = null;
  // The exact serialized JSON we last wrote ourselves; used to suppress the
  // file-change event our own save triggers. `null` means "we have not written,
  // so treat any change as external".
  private _lastWrittenContent: string | null = null;

  constructor(filePath: string, onExternalChange: (content: string) => void) {
    this._filePath = filePath;
    this._onExternalChange = onExternalChange;
  }

  /** Record the exact content we are about to write, so its echo is ignored. */
  noteWrite(content: string) {
    this._lastWrittenContent = content;
  }

  /**
   * Pure self-write check, factored out for testing: is `content` identical to
   * the last thing we wrote? Returns false before any write (null sentinel),
   * so external changes are never accidentally swallowed on first run.
   */
  isSelfWrite(content: string): boolean {
    return this._lastWrittenContent !== null && content === this._lastWrittenContent;
  }

  /**
   * Begin watching. Inert when there is no real filesystem watch available —
   * notably under specs, where `fs.watch` would either hang the suite or fire
   * unpredictably. Callers pass `enabled: false` in that case.
   */
  start(enabled: boolean) {
    if (!enabled || this._watcher) return;
    try {
      // `fs.watch` on the file itself; some platforms emit `rename` (not
      // `change`) when an atomic temp+rename replaces the file, so we react to
      // any event and let the content comparison decide.
      this._watcher = fs.watch(this._filePath, () => this._queueReload());
      // If the file is replaced via rename, the original watch handle can go
      // stale on some platforms. Re-arm on error rather than going silent.
      this._watcher.on('error', () => this._rearm(enabled));
    } catch (err) {
      // File may not exist yet on first run; nothing to watch until it does.
      this._watcher = null;
    }
  }

  private _rearm(enabled: boolean) {
    this.stop();
    this.start(enabled);
  }

  private _queueReload() {
    // Coalesce the burst of events a single save produces (temp write, rename,
    // truncate) into one reload.
    if (this._reloadTimer) clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(() => {
      this._reloadTimer = null;
      let content: string;
      try {
        content = fs.readFileSync(this._filePath, 'utf8');
      } catch (err) {
        // Mid-rename or transiently missing; ignore and wait for the next event.
        return;
      }
      if (this.isSelfWrite(content)) return;
      this._onExternalChange(content);
    }, 100);
  }

  /** Stop watching and clear any pending reload. Safe to call repeatedly. */
  stop() {
    if (this._reloadTimer) {
      clearTimeout(this._reloadTimer);
      this._reloadTimer = null;
    }
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }
}
