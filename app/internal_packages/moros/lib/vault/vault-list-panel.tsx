import React from 'react';
import { clipboard } from 'electron';
import { localized } from 'mailspring-exports';
import VaultStore, { VaultEntry } from './vault-store';

const CLIPBOARD_CLEAR_MS = 30000;
const REVEAL_HIDE_MS = 15000;

interface VaultListPanelState {
  entries: ReadonlyArray<VaultEntry>;
  searchQuery: string;
  revealedId: string | null;
  revealedSecret: string | null;
  copiedId: string | null;
}

export default class VaultListPanel extends React.Component<
  Record<string, unknown>,
  VaultListPanelState
> {
  static displayName = 'VaultListPanel';

  _unlisten?: () => void;
  _copiedTimer: ReturnType<typeof setTimeout> | null = null;
  _clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;
  _revealHideTimer: ReturnType<typeof setTimeout> | null = null;
  // Held (outside state) only to verify the clipboard still contains our
  // secret before auto-clearing — never rendered.
  _copiedSecret: string | null = null;

  state: VaultListPanelState = {
    entries: VaultStore.items(),
    searchQuery: '',
    revealedId: null,
    revealedSecret: null,
    copiedId: null,
  };

  componentDidMount() {
    this._unlisten = VaultStore.listen(() => this.setState({ entries: VaultStore.items() }));
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    if (this._clipboardClearTimer) clearTimeout(this._clipboardClearTimer);
    if (this._revealHideTimer) clearTimeout(this._revealHideTimer);
    this._copiedSecret = null;
  }

  _hideRevealed = () => {
    if (this._revealHideTimer) clearTimeout(this._revealHideTimer);
    this._revealHideTimer = null;
    this.setState({ revealedId: null, revealedSecret: null });
  };

  _onCopy = async (entry: VaultEntry) => {
    const secret = await VaultStore.getSecret(entry.id);
    if (secret === undefined) return;
    clipboard.writeText(secret);
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    this.setState({ copiedId: entry.id });
    this._copiedTimer = setTimeout(() => this.setState({ copiedId: null }), 1500);

    // Auto-clear after 30s, but only if the clipboard still holds this
    // secret — don't stomp something the user copied in the meantime.
    this._copiedSecret = secret;
    if (this._clipboardClearTimer) clearTimeout(this._clipboardClearTimer);
    this._clipboardClearTimer = setTimeout(() => {
      if (this._copiedSecret !== null && clipboard.readText() === this._copiedSecret) {
        clipboard.clear();
      }
      this._copiedSecret = null;
    }, CLIPBOARD_CLEAR_MS);
  };

  _onToggleReveal = async (entry: VaultEntry) => {
    if (this.state.revealedId === entry.id) {
      this._hideRevealed();
      return;
    }
    const secret = await VaultStore.getSecret(entry.id);
    this.setState({ revealedId: entry.id, revealedSecret: secret === undefined ? null : secret });
    // Don't leave plaintext on screen if the user walks away.
    if (this._revealHideTimer) clearTimeout(this._revealHideTimer);
    this._revealHideTimer = setTimeout(this._hideRevealed, REVEAL_HIDE_MS);
  };

  _onRemove = async (entry: VaultEntry) => {
    if (this.state.revealedId === entry.id) {
      this._hideRevealed();
    }
    await VaultStore.removeWithSecret(entry.id);
  };

  _renderEntry(entry: VaultEntry) {
    const revealed = this.state.revealedId === entry.id;
    return (
      <div className="moros-row" key={entry.id}>
        <span className={`moros-chip kind-${entry.kind}`}>
          {entry.kind === 'password' ? localized('Password') : localized('API Key')}
        </span>
        <span className="moros-row-title">{entry.name}</span>
        <span className="moros-row-detail">{entry.username}</span>
        <span className="moros-row-detail">{entry.url}</span>
        <span className="moros-secret">
          {revealed && this.state.revealedSecret !== null ? this.state.revealedSecret : '••••••••'}
        </span>
        <button className="btn" onClick={() => this._onToggleReveal(entry)}>
          {revealed ? localized('Hide') : localized('Reveal')}
        </button>
        <button className="btn" onClick={() => this._onCopy(entry)}>
          {this.state.copiedId === entry.id ? localized('Copied!') : localized('Copy')}
        </button>
        <button
          className="moros-row-delete"
          title={localized('Delete')}
          onClick={() => this._onRemove(entry)}
        >
          &times;
        </button>
      </div>
    );
  }

  _filteredEntries(): VaultEntry[] {
    const query = this.state.searchQuery.trim().toLowerCase();
    const entries = [...this.state.entries];
    if (!query) return entries;
    return entries.filter((entry) =>
      [entry.name, entry.username, entry.url].some((field) => field.toLowerCase().includes(query))
    );
  }

  render() {
    const visible = this._filteredEntries();
    return (
      <div className="moros-panel-fill">
        <div className="moros-toolbar-row">
          <input
            type="text"
            className="moros-input"
            placeholder={localized('Search vault…')}
            value={this.state.searchQuery}
            onChange={(e) => this.setState({ searchQuery: e.target.value })}
          />
        </div>
        {visible.length > 0 ? (
          visible.map((entry) => this._renderEntry(entry))
        ) : (
          <div className="moros-empty">
            {this.state.entries.length > 0
              ? localized('No entries match your search.')
              : localized('No entries yet.')}
          </div>
        )}
      </div>
    );
  }
}
