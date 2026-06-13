import React from 'react';
import { localized, IdentityStore } from 'moros-exports';
import { OpenIdentityPageButton } from 'moros-component-kit';
import AiSettingsStore from './ai-settings';
import { AiProviderId, MODEL_OPTIONS, providerById } from './ai-providers';
import KeyNestStore, { ANTHROPIC_KEY_ENTRY_NAME } from '../keynest/keynest-store';

interface AiSettingsPanelProps {
  /** Human name of the feature, e.g. "Briefing" — used in disclosure copy. */
  featureName: string;
  /** What leaves the device, e.g. "sender names, subjects, and snippets". */
  dataDescription: string;
  /** Attribution for the upgrade link. */
  upgradeSource: string;
  upgradeCampaign: string;
}

interface AiSettingsPanelState {
  provider: AiProviderId;
  model: string;
  hasIdentity: boolean;
  hasPro: boolean;
  hasKey: boolean;
  draftKey: string;
  notice: string | null;
}

function readSettings(): Pick<
  AiSettingsPanelState,
  'provider' | 'model' | 'hasIdentity' | 'hasPro'
> {
  const settings = AiSettingsStore.settings();
  return {
    provider: settings.provider,
    model: settings.model,
    hasIdentity: !!IdentityStore.identity(),
    hasPro: IdentityStore.hasProFeatures(),
  };
}

/**
 * Shared provider/model configuration UI for the Moros AI features. Renders
 * the BYOK ↔ hosted toggle, key entry (stored in KeyNest), model picker, a
 * connection test, and a data-transmission disclosure that is shown for
 * *both* providers — so a user switching to the hosted plan is told their
 * mail metadata leaves the device just as clearly as in BYOK mode.
 */
export default class AiSettingsPanel extends React.Component<
  AiSettingsPanelProps,
  AiSettingsPanelState
> {
  static displayName = 'AiSettingsPanel';

  _unlistens: Array<() => void> = [];
  _mounted = false;

  state: AiSettingsPanelState = {
    ...readSettings(),
    hasKey: false,
    draftKey: '',
    notice: null,
  };

  componentDidMount() {
    this._mounted = true;
    this._unlistens = [
      AiSettingsStore.listen(() => this.setState(readSettings())),
      IdentityStore.listen(() => this.setState(readSettings())),
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
    try {
      await KeyNestStore.upsertSecretByName(
        ANTHROPIC_KEY_ENTRY_NAME,
        { kind: 'api-key', url: 'https://console.anthropic.com' },
        key
      );
    } catch (err) {
      AppEnv.reportError(err);
      if (!this._mounted) return;
      // Keep the draft so the user can retry; surface the failure.
      this.setState({
        notice: localized('Could not save the key to your keychain: %@', errMessage(err)),
      });
      return;
    }
    if (!this._mounted) return;
    this.setState({ draftKey: '', notice: localized('Key saved to KeyNest.') });
  };

  _onValidate = async () => {
    this.setState({ notice: localized('Checking…') });
    try {
      await providerById(this.state.provider).validate();
      if (!this._mounted) return;
      this.setState({ notice: localized('Ready — the provider accepted your credentials.') });
    } catch (err) {
      if (!this._mounted) return;
      this.setState({ notice: errMessage(err) });
    }
  };

  _renderByok() {
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
            onChange={(e) => AiSettingsStore.setModel(e.target.value)}
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
            'Your key is encrypted in KeyNest with the OS keychain. %@ sends %@ from this computer directly to the Anthropic API — billed to your key.',
            this.props.featureName,
            this.props.dataDescription
          )}
        </div>
      </div>
    );
  }

  _renderHosted() {
    const { hasIdentity, hasPro } = this.state;
    return (
      <div className="moros-settings-block">
        <div className="moros-settings-line">
          <span className="moros-settings-label">{localized('Plan')}</span>
          {!hasIdentity ? (
            <span className="moros-settings-note">
              {localized('Sign in to your Moros ID (Preferences → Subscription) first.')}
            </span>
          ) : hasPro ? (
            <span className="moros-settings-note">
              {localized('Paid plan active — the hosted service is included, no API key needed.')}
            </span>
          ) : (
            <>
              <span className="moros-settings-note">
                {localized('The hosted service is included with any paid plan.')}
              </span>
              <OpenIdentityPageButton
                isCTA
                label={localized('Upgrade')}
                path="/payment"
                source={this.props.upgradeSource}
                campaign={this.props.upgradeCampaign}
              />
            </>
          )}
        </div>
        <div className="moros-settings-note">
          {localized(
            '%@ sends %@ from your inbox to the Moros hosted service to generate results. Nothing is sent until you run it.',
            this.props.featureName,
            this.props.dataDescription
          )}
        </div>
      </div>
    );
  }

  render() {
    const providers: Array<{ value: AiProviderId; label: string }> = [
      { value: 'byok', label: localized('My own API key') },
      { value: 'hosted', label: localized('Moros hosted (paid plan)') },
    ];
    return (
      <div className="moros-settings">
        <div className="moros-settings-line">
          <span className="moros-settings-label">{localized('AI provider')}</span>
          <div className="moros-filter-chips">
            {providers.map((option) => (
              <button
                key={option.value}
                className={`moros-filter-chip ${
                  this.state.provider === option.value ? 'selected' : ''
                }`}
                onClick={() => AiSettingsStore.setProvider(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {this.state.provider === 'byok' ? this._renderByok() : this._renderHosted()}
        {this.state.notice && <div className="moros-settings-notice">{this.state.notice}</div>}
      </div>
    );
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
