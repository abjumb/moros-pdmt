import React from 'react';
import { localized } from 'mailspring-exports';
import FinanceStore, {
  MorosTransaction,
  currentMonthPrefix,
  formatCents,
  monthPrefixLabel,
  shiftMonthPrefix,
} from './finance-store';
import MorosSettingsStore from '../moros-settings-store';

interface TransactionsPanelState {
  transactions: ReadonlyArray<MorosTransaction>;
  viewMonth: string | null;
}

export default class TransactionsPanel extends React.Component<
  Record<string, unknown>,
  TransactionsPanelState
> {
  static displayName = 'TransactionsPanel';

  _unlisten?: () => void;
  _unlistenSettings?: () => void;

  state: TransactionsPanelState = {
    transactions: FinanceStore.items(),
    viewMonth: currentMonthPrefix(),
  };

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

  _renderTransaction(t: MorosTransaction) {
    return (
      <div className="moros-row" key={t.id}>
        <span className="moros-row-date">{t.date}</span>
        <span className="moros-row-title">{t.description}</span>
        <span className="moros-chip">{t.category}</span>
        <span className={`moros-amount ${t.kind === 'income' ? 'is-income' : 'is-expense'}`}>
          {formatCents(FinanceStore.signedCents(t))}
        </span>
        <button
          className="moros-row-delete"
          title={localized('Delete')}
          onClick={() => FinanceStore.remove(t.id)}
        >
          &times;
        </button>
      </div>
    );
  }

  render() {
    const { viewMonth } = this.state;
    const transactions = FinanceStore.sortedByDate(viewMonth);

    return (
      <div className="moros-panel-fill">
        <div className="moros-month-nav">
          <button
            className="btn"
            title={localized('Previous month')}
            onClick={() =>
              this.setState({ viewMonth: shiftMonthPrefix(viewMonth || currentMonthPrefix(), -1) })
            }
          >
            ‹
          </button>
          <span className="moros-month-label">
            {viewMonth ? monthPrefixLabel(viewMonth) : localized('All transactions')}
          </span>
          <button
            className="btn"
            title={localized('Next month')}
            onClick={() =>
              this.setState({ viewMonth: shiftMonthPrefix(viewMonth || currentMonthPrefix(), 1) })
            }
          >
            ›
          </button>
          <button
            className="btn moros-month-toggle"
            onClick={() => this.setState({ viewMonth: viewMonth ? null : currentMonthPrefix() })}
          >
            {viewMonth ? localized('Show all') : localized('This month')}
          </button>
        </div>
        {transactions.length > 0 ? (
          transactions.map((t) => this._renderTransaction(t))
        ) : (
          <div className="moros-empty">
            {viewMonth && this.state.transactions.length > 0
              ? localized('No transactions in this month.')
              : localized('No transactions yet.')}
          </div>
        )}
      </div>
    );
  }
}
