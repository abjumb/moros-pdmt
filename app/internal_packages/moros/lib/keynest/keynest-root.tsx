import React from 'react';
import { clipboard } from 'electron';
import { localized } from 'mailspring-exports';
import KeyNestStore, { KeyNestEntry, KeyNestEntryKind, expiryState } from './keynest-store';
import {
  GeneratorOptions,
  DEFAULT_GENERATOR_OPTIONS,
  MIN_LENGTH,
  MAX_LENGTH,
  clampLength,
  generatePassword,
} from './password-generator';
import { estimateStrength, StrengthScore } from './password-strength';
import { HealthSummary } from './password-health';

type BooleanGeneratorOption = 'lowercase' | 'uppercase' | 'digits' | 'symbols';

const CLIPBOARD_CLEAR_MS = 30000;
const REVEAL_HIDE_MS = 15000;

type KindFilter = 'all' | KeyNestEntryKind;

interface KeyNestRootState {
  entries: ReadonlyArray<KeyNestEntry>;
  searchQuery: string;
  kindFilter: KindFilter;
  draftName: string;
  draftUsername: string;
  draftSecret: string;
  draftUrl: string;
  draftExpiresAt: string;
  draftKind: KeyNestEntryKind;
  revealedId: string | null;
  revealedSecret: string | null;
  copiedId: string | null;
  genOptions: GeneratorOptions;
  genError: string | null;
  health: HealthSummary | null;
  auditing: boolean;
  auditError: string | null;
}

export default class KeyNestRoot extends React.Component<
  Record<string, unknown>,
  KeyNestRootState
> {
  static displayName = 'KeyNestRoot';

  _unlisten?: () => void;
  _mounted = false;
  // Bumped whenever the entry set changes, so an in-flight audit computed
  // against the old set can detect it became stale and discard its result.
  _auditEpoch = 0;
  _copiedTimer: ReturnType<typeof setTimeout> | null = null;
  _clipboardClearTimer: ReturnType<typeof setTimeout> | null = null;
  _revealHideTimer: ReturnType<typeof setTimeout> | null = null;
  // Held (outside state) only to verify the clipboard still contains our
  // secret before auto-clearing — never rendered.
  _copiedSecret: string | null = null;

  state: KeyNestRootState = {
    entries: KeyNestStore.items(),
    searchQuery: '',
    kindFilter: 'all',
    draftName: '',
    draftUsername: '',
    draftSecret: '',
    draftUrl: '',
    draftExpiresAt: '',
    draftKind: 'password',
    revealedId: null,
    revealedSecret: null,
    copiedId: null,
    genOptions: { ...DEFAULT_GENERATOR_OPTIONS },
    genError: null,
    health: null,
    auditing: false,
    auditError: null,
  };

  componentDidMount() {
    this._mounted = true;
    // Adding or removing an entry invalidates a previous health audit, so
    // clear it (and invalidate any in-flight audit) when the entry set changes.
    this._unlisten = KeyNestStore.listen(() => {
      this._auditEpoch += 1;
      this.setState({ entries: KeyNestStore.items(), health: null });
    });
  }

  componentWillUnmount() {
    this._mounted = false;
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

  _onCreate = async () => {
    const name = this.state.draftName.trim();
    const secret = this.state.draftSecret;
    if (!name || !secret) return;
    await KeyNestStore.createWithSecret(
      {
        name,
        kind: this.state.draftKind,
        username: this.state.draftUsername.trim(),
        url: this.state.draftUrl.trim(),
        expiresAt: this.state.draftExpiresAt,
      },
      secret
    );
    this.setState({
      draftName: '',
      draftUsername: '',
      draftSecret: '',
      draftUrl: '',
      draftExpiresAt: '',
    });
  };

  _onCopy = async (entry: KeyNestEntry) => {
    const secret = await KeyNestStore.getSecret(entry.id);
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

  _onToggleReveal = async (entry: KeyNestEntry) => {
    if (this.state.revealedId === entry.id) {
      this._hideRevealed();
      return;
    }
    const secret = await KeyNestStore.getSecret(entry.id);
    this.setState({ revealedId: entry.id, revealedSecret: secret === undefined ? null : secret });
    // Don't leave plaintext on screen if the user walks away.
    if (this._revealHideTimer) clearTimeout(this._revealHideTimer);
    this._revealHideTimer = setTimeout(this._hideRevealed, REVEAL_HIDE_MS);
  };

  _onRemove = async (entry: KeyNestEntry) => {
    if (this.state.revealedId === entry.id) {
      this._hideRevealed();
    }
    await KeyNestStore.removeWithSecret(entry.id);
  };

  _setGenOption = (patch: Partial<GeneratorOptions>) => {
    this.setState({ genOptions: { ...this.state.genOptions, ...patch }, genError: null });
  };

  _onGenerate = () => {
    try {
      const secret = generatePassword(this.state.genOptions);
      this.setState({ draftSecret: secret, draftKind: 'password', genError: null });
    } catch (err) {
      this.setState({ genError: err instanceof Error ? err.message : String(err) });
    }
  };

  _onAudit = async () => {
    const epoch = this._auditEpoch;
    this.setState({ auditing: true, auditError: null });
    try {
      const health = await KeyNestStore.auditPasswords();
      if (!this._mounted) return;
      // The entry set changed while auditing — the result is stale; drop it
      // (the listener already cleared `health`) but stop the spinner.
      if (this._auditEpoch !== epoch) {
        this.setState({ auditing: false });
        return;
      }
      this.setState({ health, auditing: false });
    } catch (err) {
      AppEnv.reportError(err);
      if (!this._mounted) return;
      if (this._auditEpoch !== epoch) {
        this.setState({ auditing: false });
        return;
      }
      this.setState({
        auditing: false,
        auditError: err instanceof Error ? err.message : String(err),
      });
    }
  };

  _strengthLabel(score: StrengthScore): string {
    return [
      localized('Very weak'),
      localized('Weak'),
      localized('Fair'),
      localized('Strong'),
      localized('Very strong'),
    ][score];
  }

  _healthFor(id: string): { weak: boolean; reused: boolean } | null {
    if (!this.state.health) return null;
    const match = this.state.health.entries.find((e) => e.entry.id === id);
    return match ? { weak: match.weak, reused: match.reused } : null;
  }

  _renderHealthChips(id: string) {
    const health = this._healthFor(id);
    if (!health) return null;
    return (
      <>
        {health.weak && <span className="moros-chip health-weak">{localized('Weak')}</span>}
        {health.reused && <span className="moros-chip health-reused">{localized('Reused')}</span>}
      </>
    );
  }

  _renderStrengthMeter() {
    const secret = this.state.draftSecret;
    if (this.state.draftKind !== 'password' || !secret) return null;
    const { score } = estimateStrength(secret);
    return (
      <div className={`moros-strength strength-${score}`}>
        <div className="moros-strength-bar">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`moros-strength-seg ${i < score ? 'filled' : ''}`} />
          ))}
        </div>
        <span className="moros-strength-label">{this._strengthLabel(score)}</span>
      </div>
    );
  }

  _renderGenerator() {
    const { genOptions } = this.state;
    const toggle = (key: BooleanGeneratorOption, label: string) => (
      <label className="moros-gen-toggle">
        <input
          type="checkbox"
          checked={genOptions[key]}
          onChange={(e) =>
            this._setGenOption({ [key]: e.target.checked } as Partial<GeneratorOptions>)
          }
        />
        {label}
      </label>
    );
    return (
      <div className="moros-toolbar-row moros-generator">
        <span className="moros-gen-label">{localized('Generate')}</span>
        <input
          type="number"
          className="moros-input moros-gen-length"
          min={MIN_LENGTH}
          max={MAX_LENGTH}
          title={localized('Length')}
          value={genOptions.length}
          onChange={(e) => this._setGenOption({ length: Number(e.target.value) })}
          onBlur={(e) => this._setGenOption({ length: clampLength(Number(e.target.value)) })}
        />
        {toggle('lowercase', localized('a–z'))}
        {toggle('uppercase', localized('A–Z'))}
        {toggle('digits', localized('0–9'))}
        {toggle('symbols', localized('!@#'))}
        <button className="btn" onClick={this._onGenerate}>
          {localized('Generate password')}
        </button>
        {this.state.genError && <span className="moros-gen-error">{this.state.genError}</span>}
      </div>
    );
  }

  _renderHealth() {
    const { health, auditing, auditError } = this.state;
    return (
      <div className="moros-toolbar-row moros-health-row">
        <button className="btn" disabled={auditing} onClick={this._onAudit}>
          {auditing ? localized('Checking…') : localized('Check password health')}
        </button>
        {auditError && <span className="moros-gen-error">{auditError}</span>}
        {health && !auditError && (
          <span className="moros-health-summary">
            {health.checked === 0
              ? localized('No stored passwords to check.')
              : localized(
                  'Checked %@ · %@ weak · %@ reused',
                  `${health.checked}`,
                  `${health.weakCount}`,
                  `${health.reusedCount}`
                )}
          </span>
        )}
      </div>
    );
  }

  _renderExpiryChip(entry: KeyNestEntry) {
    const state = expiryState(entry);
    if (state === 'ok') return null;
    return (
      <span className={`moros-chip expiry-${state}`}>
        {state === 'expired' ? localized('Expired') : localized('Expires %@', entry.expiresAt)}
      </span>
    );
  }

  _renderEntry(entry: KeyNestEntry) {
    const revealed = this.state.revealedId === entry.id;
    return (
      <div className="moros-row" key={entry.id}>
        <span className={`moros-chip kind-${entry.kind}`}>
          {entry.kind === 'password' ? localized('Password') : localized('API Key')}
        </span>
        <span className="moros-row-title">{entry.name}</span>
        {this._renderExpiryChip(entry)}
        {this._renderHealthChips(entry.id)}
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

  _filteredEntries(): KeyNestEntry[] {
    const query = this.state.searchQuery.trim().toLowerCase();
    let entries = [...this.state.entries];
    if (this.state.kindFilter !== 'all') {
      entries = entries.filter((entry) => entry.kind === this.state.kindFilter);
    }
    if (!query) return entries;
    return entries.filter((entry) =>
      [entry.name, entry.username, entry.url].some((field) => field.toLowerCase().includes(query))
    );
  }

  _renderKindFilter() {
    const filters: Array<{ value: KindFilter; label: string }> = [
      { value: 'all', label: localized('All') },
      { value: 'password', label: localized('Passwords') },
      { value: 'api-key', label: localized('API Keys') },
    ];
    return (
      <div className="moros-filter-chips">
        {filters.map((filter) => (
          <button
            key={filter.value}
            className={`moros-filter-chip ${
              this.state.kindFilter === filter.value ? 'selected' : ''
            }`}
            onClick={() => this.setState({ kindFilter: filter.value })}
          >
            {filter.label}
          </button>
        ))}
      </div>
    );
  }

  render() {
    const visible = this._filteredEntries();
    return (
      <div className="moros-root moros-keynest">
        <div className="moros-header">
          <h2>{localized('KeyNest')}</h2>
          <div className="moros-header-note">
            {localized(
              'One nest for every credential — passwords and API keys used across Moros. Secrets are encrypted with your operating system keychain and never written to disk in plaintext. Copied secrets are cleared from the clipboard after 30 seconds.'
            )}
          </div>
        </div>
        <div className="moros-toolbar-row">
          <input
            type="text"
            className="moros-input"
            placeholder={localized('Search KeyNest…')}
            value={this.state.searchQuery}
            onChange={(e) => this.setState({ searchQuery: e.target.value })}
          />
          {this._renderKindFilter()}
        </div>
        {this._renderHealth()}
        <div className="moros-toolbar-row">
          <select
            className="moros-select"
            value={this.state.draftKind}
            onChange={(e) => this.setState({ draftKind: e.target.value as KeyNestEntryKind })}
          >
            <option value="password">{localized('Password')}</option>
            <option value="api-key">{localized('API Key')}</option>
          </select>
          <input
            type="text"
            className="moros-input"
            placeholder={localized('Name (e.g. GitHub)')}
            value={this.state.draftName}
            onChange={(e) => this.setState({ draftName: e.target.value })}
          />
          <input
            type="text"
            className="moros-input"
            placeholder={localized('Username / key ID')}
            value={this.state.draftUsername}
            onChange={(e) => this.setState({ draftUsername: e.target.value })}
          />
          <input
            type="password"
            className="moros-input"
            placeholder={localized('Secret')}
            value={this.state.draftSecret}
            onChange={(e) => this.setState({ draftSecret: e.target.value })}
          />
          {this._renderStrengthMeter()}
          <input
            type="text"
            className="moros-input"
            placeholder={localized('URL (optional)')}
            value={this.state.draftUrl}
            onChange={(e) => this.setState({ draftUrl: e.target.value })}
          />
          <input
            type="date"
            className="moros-input moros-input-date"
            title={localized('Expiration date (optional)')}
            value={this.state.draftExpiresAt}
            onChange={(e) => this.setState({ draftExpiresAt: e.target.value })}
          />
          <button className="btn btn-emphasis" onClick={this._onCreate}>
            {localized('Add')}
          </button>
        </div>
        {this.state.draftKind === 'password' && this._renderGenerator()}
        <div className="moros-scroll-region">
          {visible.length > 0 ? (
            visible.map((entry) => this._renderEntry(entry))
          ) : (
            <div className="moros-empty">
              {this.state.entries.length > 0
                ? localized('No entries match your search.')
                : localized('No entries yet — store an API key or password above.')}
            </div>
          )}
        </div>
      </div>
    );
  }
}
