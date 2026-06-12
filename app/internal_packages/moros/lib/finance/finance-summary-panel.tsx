import React from 'react';
import { localized } from 'mailspring-exports';
import FinanceStore, {
  MorosTransaction,
  currentMonthPrefix,
  formatCents,
  monthPrefixLabel,
} from './finance-store';
import MorosSettingsStore from '../moros-settings-store';

export default class FinanceSummaryPanel extends React.Component<
  Record<string, unknown>,
  { transactions: ReadonlyArray<MorosTransaction> }
> {
  static displayName = 'FinanceSummaryPanel';

  _unlisten?: () => void;
  _unlistenSettings?: () => void;

  state = { transactions: FinanceStore.items() };

  componentDidMount() {
    this._unlisten = FinanceStore.listen(() =>
      this.setState({ transactions: FinanceStore.items() })
    );
    // Re-render amounts when the configured currency changes.
    this._unlistenSettings = MorosSettingsStore.listen(() => this.forceUpdate());
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
    if (this._unlistenSettings) this._unlistenSettings();
  }

  render() {
    const month = currentMonthPrefix();
    const { incomeCents, spendingCents } = FinanceStore.monthTotals(month);
    const monthName = monthPrefixLabel(month);
    const cards = [
      { label: localized('Balance'), value: FinanceStore.balanceCents(), className: '' },
      {
        label: `${localized('Income')} — ${monthName}`,
        value: incomeCents,
        className: 'is-income',
      },
      {
        label: `${localized('Spending')} — ${monthName}`,
        value: -spendingCents,
        className: 'is-expense',
      },
    ];
    return (
      <div className="moros-cards moros-cards-panel">
        {cards.map((card) => (
          <div className="moros-card" key={card.label}>
            <div className="moros-card-label">{card.label}</div>
            <div className={`moros-card-value ${card.className}`}>{formatCents(card.value)}</div>
          </div>
        ))}
      </div>
    );
  }
}
