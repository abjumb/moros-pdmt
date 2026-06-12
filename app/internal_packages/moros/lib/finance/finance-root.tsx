import React from 'react';
import { localized } from 'mailspring-exports';
import PanelGrid from '../panels/panel-grid';
import MorosSettingsStore, { CURRENCIES } from '../moros-settings-store';

export default class FinanceRoot extends React.Component<
  Record<string, unknown>,
  { currency: string }
> {
  static displayName = 'FinanceRoot';

  _unlisten?: () => void;

  state = { currency: MorosSettingsStore.currency() };

  componentDidMount() {
    this._unlisten = MorosSettingsStore.listen(() =>
      this.setState({ currency: MorosSettingsStore.currency() })
    );
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
  }

  render() {
    return (
      <div className="moros-root moros-finance">
        <div className="moros-header moros-header-split">
          <h2>{localized('Finance')}</h2>
          <select
            className="moros-select"
            title={localized('Currency')}
            value={this.state.currency}
            onChange={(e) => MorosSettingsStore.setCurrency(e.target.value)}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
        <div className="moros-scroll-region">
          <PanelGrid module="finance" />
        </div>
      </div>
    );
  }
}
