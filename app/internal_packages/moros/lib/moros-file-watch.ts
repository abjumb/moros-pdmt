import fs from 'fs';
import path from 'path';

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
   * One-shot self-write check used by the watcher: like `isSelfWrite`, but
   * clears the marker on a match so that a *later* external write with the same
   * content (e.g. another window reverting to a value we previously wrote) is
   * NOT mistaken for our own echo and silently dropped.
   */
  consumeSelfWrite(content: string): boolean {
    if (this.isSelfWrite(content)) {
      this._lastWrittenContent = null;
      return true;
    }
    return false;
  }

  /**
   * Begin watching. Inert when there is no real filesystem watch available —
   * notably under specs, where `fs.watch` would either hang the suite or fire
   * unpredictably. Callers pass `enabled: false` in that case.
   */
  start(enabled: boolean) {
    if (!enabled || this._watcher) return;
    const dir = path.dirname(this._filePath);
    const base = path.basename(this._filePath);
    try {
      // Ensure the data directory exists so the watch arms immediately — even in
      // a passive widget window on a fresh profile that never writes itself.
      // Without this, a missing dir would throw, leave the watcher unset, and it
      // would never re-arm (stores only re-arm after their own successful save).
      fs.mkdirSync(dir, { recursive: true });
      // Watch the *directory*, not the file. The stores save via an atomic
      // temp-file + `renameSync`, which swaps the inode out from under a
      // file-level `fs.watch` handle — it would see the first write and then
      // silently miss every later one. Watching the directory and filtering on
      // the basename survives the rename. (`filename` can be null on some
      // platforms, so fall back to reacting and letting the content check decide.)
      this._watcher = fs.watch(dir, (_event, filename) => {
        if (!filename || filename === base) this._queueReload();
      });
      // Re-arm on error rather than going silent.
      this._watcher.on('error', () => this._rearm(enabled));
    } catch (err) {
      // Couldn't create/watch the directory; leave unset and retry on the next
      // _startWatching() (e.g. after a successful save).
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
      if (this.consumeSelfWrite(content)) return;
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
