import React from 'react';
import { localized, Actions, Contact } from 'mailspring-exports';
import SubscriptionsStore, {
  CADENCE_LABELS,
  MorosSubscription,
  SUBSCRIPTION_CATEGORIES,
  SubscriptionCadence,
  daysUntil,
  formatCents,
  monthlyCents,
  parseAmountToCents,
} from './subscriptions-store';
import { SubscriptionCandidate, scanRecentMessages } from './subscription-detector';
import { classifyCandidates } from './subscription-ai';
import AiSettingsPanel from '../ai/ai-settings-panel';
import AiSettingsStore from '../ai/ai-settings';
import { providerById } from '../ai/ai-providers';
import { todayISO } from '../moros-data-store';

interface SubscriptionsRootState {
  subscriptions: ReadonlyArray<MorosSubscription>;
  draftName: string;
  draftAmount: string;
  draftCadence: SubscriptionCadence;
  draftNextRenewal: string;
  draftCategory: string;
  suggestions: SubscriptionCandidate[];
  scanning: boolean;
  scanRan: boolean;
  scanError: string | null;
  refining: boolean;
  aiNotice: string | null;
}

export default class SubscriptionsRoot extends React.Component<
  Record<string, unknown>,
  SubscriptionsRootState
> {
  static displayName = 'SubscriptionsRoot';

  _unlisten?: () => void;
  _mounted = false;

  state: SubscriptionsRootState = {
    subscriptions: SubscriptionsStore.items(),
    draftName: '',
    draftAmount: '',
    draftCadence: 'monthly',
    draftNextRenewal: '',
    draftCategory: SUBSCRIPTION_CATEGORIES[0],
    suggestions: [],
    scanning: false,
    scanRan: false,
    scanError: null,
    refining: false,
    aiNotice: null,
  };

  componentDidMount() {
    this._mounted = true;
    this._unlisten = SubscriptionsStore.listen(() =>
      this.setState({ subscriptions: SubscriptionsStore.items() })
    );
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._unlisten) this._unlisten();
  }

  _onCreate = () => {
    const name = this.state.draftName.trim();
    const amountCents = parseAmountToCents(this.state.draftAmount);
    if (!name || !amountCents) return;
    SubscriptionsStore.create({
      name,
      vendorEmail: '',
      amountCents,
      cadence: this.state.draftCadence,
      nextRenewal: this.state.draftNextRenewal,
      category: this.state.draftCategory,
      status: 'active',
      source: 'manual',
    });
    this.setState({ draftName: '', draftAmount: '', draftNextRenewal: '' });
  };

  _onScan = async () => {
    this.setState({ scanning: true, scanError: null, aiNotice: null });
    try {
      const suggestions = await scanRecentMessages(SubscriptionsStore.trackedVendorEmails());
      if (!this._mounted) return;
      this.setState({ suggestions, scanning: false, scanRan: true });
    } catch (err) {
      AppEnv.reportError(err);
      if (!this._mounted) return;
      this.setState({
        suggestions: [],
        scanning: false,
        scanRan: true,
        scanError: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Refine the regex-detected suggestions with the configured AI provider:
  // drop false positives and normalize names/categories/amounts.
  _onRefine = async () => {
    const { provider: providerId, model } = AiSettingsStore.settings();
    const provider = providerById(providerId);
    if (!(await provider.isConfigured())) {
      if (!this._mounted) return;
      this.setState({
        aiNotice: localized('Configure an AI provider above before refining with AI.'),
      });
      return;
    }
    // Snapshot the candidates before any await — `_onScan` could otherwise
    // replace this.state.suggestions mid-flight, skewing the count and
    // overwriting fresh results.
    const original = this.state.suggestions;
    this.setState({ refining: true, aiNotice: null });
    try {
      const refined = await classifyCandidates(provider, original, { model });
      if (!this._mounted) return;
      this.setState({
        suggestions: refined,
        refining: false,
        aiNotice: localized(
          'AI kept %@ of %@ detected charges.',
          `${refined.length}`,
          `${original.length}`
        ),
      });
    } catch (err) {
      AppEnv.reportError(err);
      if (!this._mounted) return;
      this.setState({
        refining: false,
        aiNotice: err instanceof Error ? err.message : String(err),
      });
    }
  };

  _onAcceptSuggestion = (candidate: SubscriptionCandidate) => {
    SubscriptionsStore.create({
      name: candidate.name,
      vendorEmail: candidate.vendorEmail,
      amountCents: candidate.amountCents || 0,
      cadence: candidate.cadence,
      nextRenewal: '',
      category: candidate.category || SUBSCRIPTION_CATEGORIES[0],
      status: 'active',
      source: 'detected',
    });
    this._onDismissSuggestion(candidate);
  };

  _onDismissSuggestion = (candidate: SubscriptionCandidate) => {
    this.setState({
      suggestions: this.state.suggestions.filter(
        (item) => item.vendorEmail !== candidate.vendorEmail
      ),
    });
  };

  _onToggleCanceled = (sub: MorosSubscription) => {
    SubscriptionsStore.update(sub.id, {
      status: sub.status === 'canceled' ? 'active' : 'canceled',
    });
  };

  _onDraftCancellation = (sub: MorosSubscription) => {
    Actions.composeNewDraftToRecipient(new Contact({ name: sub.name, email: sub.vendorEmail }));
  };

  _renderStatCards() {
    const active = SubscriptionsStore.active();
    const renewing = SubscriptionsStore.renewingSoon(30);
    const stats = [
      {
        label: localized('Monthly spend'),
        value: formatCents(SubscriptionsStore.totalMonthlyCents()),
      },
      {
        label: localized('Yearly spend'),
        value: formatCents(SubscriptionsStore.totalYearlyCents()),
      },
      { label: localized('Active subscriptions'), value: `${active.length}` },
      { label: localized('Renewing in 30 days'), value: `${renewing.length}` },
    ];
    return (
      <div className="moros-cards">
        {stats.map((stat) => (
          <div className="moros-card" key={stat.label}>
            <div className="moros-card-label">{stat.label}</div>
            <div className="moros-card-value">{stat.value}</div>
          </div>
        ))}
      </div>
    );
  }

  _renderAiSettings() {
    return (
      <div className="moros-ai-section">
        <div className="moros-section-title">{localized('AI-assisted detection (optional)')}</div>
        <AiSettingsPanel
          featureName={localized('Subscription detection')}
          dataDescription={localized('vendor names, billing addresses, and amounts')}
          upgradeSource="MorosSubscriptions"
          upgradeCampaign="Hosted subscription detection"
        />
      </div>
    );
  }

  _renderSuggestionsHeader(showRefine: boolean) {
    return (
      <div className="moros-section-header">
        <span className="moros-section-title">{localized('Detected in your inbox')}</span>
        {showRefine && (
          <button
            className="btn moros-section-action"
            disabled={this.state.refining}
            onClick={this._onRefine}
          >
            {this.state.refining ? localized('Refining…') : localized('Refine with AI')}
          </button>
        )}
      </div>
    );
  }

  _renderSuggestions() {
    const { suggestions, scanning, scanRan, scanError } = this.state;
    if (!scanRan && !scanning && suggestions.length === 0) return null;
    if (scanError) {
      return (
        <div className="moros-suggestions">
          {this._renderSuggestionsHeader(false)}
          <div className="moros-empty moros-scan-error">
            {localized('The inbox scan failed: %@', scanError)}
          </div>
        </div>
      );
    }
    return (
      <div className="moros-suggestions">
        {this._renderSuggestionsHeader(suggestions.length > 0)}
        {this.state.aiNotice && <div className="moros-settings-notice">{this.state.aiNotice}</div>}
        {suggestions.length === 0 ? (
          <div className="moros-empty">
            {scanning
              ? localized('Scanning…')
              : localized('No new subscription receipts found in the last 90 days.')}
          </div>
        ) : (
          suggestions.map((candidate) => (
            <div className="moros-row moros-suggestion" key={candidate.vendorEmail}>
              <span className="moros-row-title">{candidate.name}</span>
              <span className="moros-row-detail">{candidate.vendorEmail}</span>
              <span className="moros-row-detail">
                {candidate.amountCents !== null
                  ? `${formatCents(candidate.amountCents)}${CADENCE_LABELS[candidate.cadence]}`
                  : localized('Amount unknown')}
              </span>
              <button
                className="btn btn-emphasis"
                onClick={() => this._onAcceptSuggestion(candidate)}
              >
                {localized('Track')}
              </button>
              <button className="btn" onClick={() => this._onDismissSuggestion(candidate)}>
                {localized('Dismiss')}
              </button>
            </div>
          ))
        )}
      </div>
    );
  }

  _renderRenewalBadge(sub: MorosSubscription) {
    if (!sub.nextRenewal || sub.status === 'canceled') return null;
    const days = daysUntil(sub.nextRenewal);
    if (days < 0) {
      return <span className="moros-chip expiry-expired">{localized('Renewal date passed')}</span>;
    }
    if (days <= 7) {
      return (
        <span className="moros-chip expiry-expiring-soon">
          {days === 0 ? localized('Renews today') : localized('Renews in %@ days', `${days}`)}
        </span>
      );
    }
    return <span className="moros-row-detail">{localized('Renews %@', sub.nextRenewal)}</span>;
  }

  _renderSubscription(sub: MorosSubscription) {
    const canceled = sub.status === 'canceled';
    return (
      <div className={`moros-row ${canceled ? 'moros-row-muted' : ''}`} key={sub.id}>
        <span className={`moros-chip status-${sub.status}`}>
          {canceled ? localized('Canceled') : sub.category}
        </span>
        <span className="moros-row-title">{sub.name}</span>
        <span className="moros-amount">
          {formatCents(sub.amountCents)}
          {CADENCE_LABELS[sub.cadence]}
        </span>
        {sub.cadence !== 'monthly' && !canceled && (
          <span className="moros-row-detail">
            {localized('≈ %@/mo', formatCents(monthlyCents(sub)))}
          </span>
        )}
        {this._renderRenewalBadge(sub)}
        {sub.vendorEmail && !canceled && (
          <button
            className="btn"
            title={localized('Compose a cancellation request to %@', sub.vendorEmail)}
            onClick={() => this._onDraftCancellation(sub)}
          >
            {localized('Draft cancellation')}
          </button>
        )}
        <button className="btn" onClick={() => this._onToggleCanceled(sub)}>
          {canceled ? localized('Reactivate') : localized('Mark canceled')}
        </button>
        <button
          className="moros-row-delete"
          title={localized('Delete')}
          onClick={() => SubscriptionsStore.remove(sub.id)}
        >
          &times;
        </button>
      </div>
    );
  }

  render() {
    const sorted = [...this.state.subscriptions].sort((a, b) => {
      if ((a.status === 'canceled') !== (b.status === 'canceled')) {
        return a.status === 'canceled' ? 1 : -1;
      }
      return monthlyCents(b) - monthlyCents(a);
    });
    return (
      <div className="moros-root moros-subscriptions">
        <div className="moros-header">
          <h2>{localized('Subscriptions')}</h2>
          <div className="moros-header-note">
            {localized(
              'Track recurring charges, see what they cost per month and per year, and catch renewals before they bill. Scanning runs locally against mail already on this computer.'
            )}
          </div>
        </div>
        {this._renderStatCards()}
        <div className="moros-toolbar-row">
          <input
            type="text"
            className="moros-input"
            placeholder={localized('Subscription (e.g. Netflix)')}
            value={this.state.draftName}
            onChange={(e) => this.setState({ draftName: e.target.value })}
          />
          <input
            type="text"
            className="moros-input moros-input-amount"
            placeholder={localized('Amount')}
            value={this.state.draftAmount}
            onChange={(e) => this.setState({ draftAmount: e.target.value })}
          />
          <select
            className="moros-select"
            value={this.state.draftCadence}
            onChange={(e) => this.setState({ draftCadence: e.target.value as SubscriptionCadence })}
          >
            <option value="weekly">{localized('Weekly')}</option>
            <option value="monthly">{localized('Monthly')}</option>
            <option value="yearly">{localized('Yearly')}</option>
          </select>
          <select
            className="moros-select"
            value={this.state.draftCategory}
            onChange={(e) => this.setState({ draftCategory: e.target.value })}
          >
            {SUBSCRIPTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="moros-input moros-input-date"
            title={localized('Next renewal (optional)')}
            min={todayISO()}
            value={this.state.draftNextRenewal}
            onChange={(e) => this.setState({ draftNextRenewal: e.target.value })}
          />
          <button className="btn btn-emphasis" onClick={this._onCreate}>
            {localized('Add')}
          </button>
          <button className="btn" disabled={this.state.scanning} onClick={this._onScan}>
            {this.state.scanning ? localized('Scanning…') : localized('Scan inbox')}
          </button>
        </div>
        {this._renderAiSettings()}
        {this._renderSuggestions()}
        <div className="moros-scroll-region">
          {sorted.length > 0 ? (
            sorted.map((sub) => this._renderSubscription(sub))
          ) : (
            <div className="moros-empty">
              {localized('No subscriptions yet — add one above, or scan your inbox for receipts.')}
            </div>
          )}
        </div>
      </div>
    );
  }
}
