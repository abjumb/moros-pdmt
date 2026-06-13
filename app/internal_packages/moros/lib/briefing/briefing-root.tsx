import React from 'react';
import { localized, IdentityStore } from 'mailspring-exports';
import { OpenIdentityPageButton } from 'mailspring-component-kit';
import BriefingStore, { BRIEF_WINDOW_HOURS, MorosBrief } from './briefing-store';
import { BriefingProviderId, MODEL_OPTIONS, providerById } from './briefing-providers';
import KeyNestStore, { ANTHROPIC_KEY_ENTRY_NAME } from '../keynest/keynest-store';

interface BriefingRootState {
  working: boolean;
  lastError: string | null;
  latest: MorosBrief | undefined;
  provider: BriefingProviderId;
  model: string;
  hasIdentity: boolean;
  hasPro: boolean;
  hasKey: boolean;
  draftKey: string;
  keyNotice: string | null;
}

function readState(): Omit<BriefingRootState, 'draftKey' | 'keyNotice' | 'hasKey'> {
  const settings = BriefingStore.settings();
  return {
    working: BriefingStore.isWorking(),
    lastError: BriefingStore.lastError(),
    latest: BriefingStore.latestBrief(),
    provider: settings.provider,
    model: settings.model,
    hasIdentity: !!IdentityStore.identity(),
    hasPro: IdentityStore.hasProFeatures(),
  };
}

/**
 * Minimal renderer for the model's Markdown brief. Only the structures the
 * prompt asks for are handled (## headings and bullets) — everything is
 * rendered through React text nodes, so the model output is never injected
 * as HTML.
 */
function renderBriefMarkdown(markdown: string) {
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={`ul-${key++}`}>
        {bullets.map((text, i) => (
          <li key={i}>{text.replace(/\*\*/g, '')}</li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    if (!line) continue;
    if (line.startsWith('##')) {
      nodes.push(<h3 key={`h-${key++}`}>{line.replace(/^#+\s*/, '')}</h3>);
    } else {
      nodes.push(<p key={`p-${key++}`}>{line.replace(/\*\*/g, '')}</p>);
    }
  }
  flushBullets();
  return nodes;
}

export default class BriefingRoot extends React.Component<
  Record<string, unknown>,
  BriefingRootState
> {
  static displayName = 'BriefingRoot';

  _unlistens: Array<() => void> = [];
  _mounted = false;

  state: BriefingRootState = {
    ...readState(),
    hasKey: false,
    draftKey: '',
    keyNotice: null,
  };

  componentDidMount() {
    this._mounted = true;
    this._unlistens = [
      BriefingStore.listen(() => this.setState(readState())),
      IdentityStore.listen(() => this.setState(readState())),
      KeyNestStore.listen(() => this._refreshKeyPresence()),
    ];
    this._refreshKeyPresence();
  }

  componentWillUnmount() {
    this._mounted = false;
    for (const unlisten of this._unlistens) unlisten();
  }

  _refreshKeyPresence = async () => {
    const secret = await KeyNestStore.getSecretByName(ANTHROPIC_KEY_ENTRY_NAME);
    if (!this._mounted) return;
    this.setState({ hasKey: secret !== undefined });
  };

  _onSaveKey = async () => {
    const key = this.state.draftKey.trim();
    if (!key) return;
    await KeyNestStore.upsertSecretByName(
      ANTHROPIC_KEY_ENTRY_NAME,
      { kind: 'api-key', url: 'https://console.anthropic.com' },
      key
    );
    if (!this._mounted) return;
    this.setState({
      draftKey: '',
      keyNotice: localized('Key saved to KeyNest.'),
    });
  };

  _onValidate = async () => {
    this.setState({ keyNotice: localized('Checking…') });
    try {
      await providerById(this.state.provider).validate();
      if (!this._mounted) return;
      this.setState({ keyNotice: localized('Ready — the provider accepted your credentials.') });
    } catch (err) {
      if (!this._mounted) return;
      this.setState({ keyNotice: err instanceof Error ? err.message : `${err}` });
    }
  };

  _renderByokSettings() {
    return (
      <div className="moros-settings-block">
        <div className="moros-settings-line">
          <span className="moros-settings-label">{localized('Anthropic API key')}</span>
          <input
            type="password"
            className="moros-input"
            placeholder={
              this.state.hasKey
                ? localized('Stored in KeyNest — paste to replace')
                : localized('sk-ant-…')
            }
            value={this.state.draftKey}
            onChange={(e) => this.setState({ draftKey: e.target.value })}
          />
          <button className="btn" onClick={this._onSaveKey} disabled={!this.state.draftKey.trim()}>
            {localized('Save to KeyNest')}
          </button>
        </div>
        <div className="moros-settings-line">
          <span className="moros-settings-label">{localized('Model')}</span>
          <select
            className="moros-select"
            value={this.state.model}
            onChange={(e) => BriefingStore.setModel(e.target.value)}
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={this._onValidate}>
            {localized('Test connection')}
          </button>
        </div>
        <div className="moros-settings-note">
          {localized(
            'Your key is encrypted in KeyNest with the OS keychain. Briefs are generated by sending sender names, subjects, and snippets directly from this computer to the Anthropic API — billed to your key.'
          )}
        </div>
      </div>
    );
  }

  _renderHostedSettings() {
    const { hasIdentity, hasPro } = this.state;
    return (
      <div className="moros-settings-block">
        <div className="moros-settings-line">
          <span className="moros-settings-label">{localized('Plan')}</span>
          {!hasIdentity ? (
            <span className="moros-settings-note">
              {localized('Sign in to your Mailspring ID (Preferences → Subscription) first.')}
            </span>
          ) : hasPro ? (
            <span className="moros-settings-note">
              {localized('Paid plan active — hosted briefing is included, no API key needed.')}
            </span>
          ) : (
            <>
              <span className="moros-settings-note">
                {localized('Hosted briefing is included with any paid plan.')}
              </span>
              <OpenIdentityPageButton
                isCTA
                label={localized('Upgrade')}
                path="/payment"
                source="MorosBriefing"
                campaign="Hosted briefing"
              />
            </>
          )}
        </div>
      </div>
    );
  }

  _renderSettings() {
    const providers: Array<{ value: BriefingProviderId; label: string }> = [
      { value: 'byok', label: localized('My own API key') },
      { value: 'hosted', label: localized('Moros hosted (paid plan)') },
    ];
    return (
      <div className="moros-settings">
        <div className="moros-settings-line">
          <span className="moros-settings-label">{localized('Generate briefs with')}</span>
          <div className="moros-filter-chips">
            {providers.map((option) => (
              <button
                key={option.value}
                className={`moros-filter-chip ${
                  this.state.provider === option.value ? 'selected' : ''
                }`}
                onClick={() => BriefingStore.setProvider(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {this.state.provider === 'byok' ? this._renderByokSettings() : this._renderHostedSettings()}
        {this.state.keyNotice && (
          <div className="moros-settings-notice">{this.state.keyNotice}</div>
        )}
      </div>
    );
  }

  _renderBrief() {
    const { latest, working, lastError } = this.state;
    if (lastError) {
      return <div className="moros-brief-error">{lastError}</div>;
    }
    if (!latest) {
      return (
        <div className="moros-empty">
          {working
            ? localized('Reading your mail and writing the brief…')
            : localized(
                'No briefs yet — configure a provider above, then generate your first brief.'
              )}
        </div>
      );
    }
    return (
      <div className="moros-brief">
        <div className="moros-brief-meta">
          {localized(
            'Generated %@ · %@ emails · %@',
            new Date(latest.createdAt).toLocaleString(),
            `${latest.messageCount}`,
            latest.model
          )}
        </div>
        <div className="moros-brief-output">{renderBriefMarkdown(latest.markdown)}</div>
      </div>
    );
  }

  render() {
    return (
      <div className="moros-root moros-briefing">
        <div className="moros-header">
          <h2>{localized('Briefing')}</h2>
          <div className="moros-header-note">
            {localized(
              'A daily brief of the last %@ hours of mail, organized by what needs you first — powered by your own Anthropic API key, or by the hosted Moros service on paid plans.',
              `${BRIEF_WINDOW_HOURS}`
            )}
          </div>
        </div>
        {this._renderSettings()}
        <div className="moros-toolbar-row">
          <button
            className="btn btn-emphasis"
            disabled={this.state.working}
            onClick={() => BriefingStore.generate()}
          >
            {this.state.working ? localized('Generating…') : localized('Generate brief')}
          </button>
        </div>
        <div className="moros-scroll-region">{this._renderBrief()}</div>
      </div>
    );
  }
}
