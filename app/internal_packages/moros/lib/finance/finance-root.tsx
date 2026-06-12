import React from 'react';
import { localized } from 'mailspring-exports';
import FinanceStore, {
  CATEGORIES,
  MorosTransaction,
  TransactionKind,
  formatCents,
  parseAmountToCents,
  todayISO,
} from './finance-store';

interface FinanceRootState {
  transactions: ReadonlyArray<MorosTransaction>;
  draftDescription: string;
  draftAmount: string;
  draftKind: TransactionKind;
  draftCategory: string;
  draftDate: string;
}

export default class FinanceRoot extends React.Component<
  Record<string, unknown>,
  FinanceRootState
> {
  static displayName = 'FinanceRoot';

  _unlisten?: () => void;

  state: FinanceRootState = {
    transactions: FinanceStore.items(),
    draftDescription: '',
    draftAmount: '',
    draftKind: 'expense',
    draftCategory: CATEGORIES[0],
    draftDate: todayISO(),
  };

  componentDidMount() {
    this._unlisten = FinanceStore.listen(() =>
      this.setState({ transactions: FinanceStore.items() })
    );
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
  }

  _onCreate = () => {
    const description = this.state.draftDescription.trim();
    const amountCents = parseAmountToCents(this.state.draftAmount);
    if (!description || !amountCents) return;
    FinanceStore.create({
      description,
      amountCents,
      kind: this.state.draftKind,
      category: this.state.draftCategory,
      date: this.state.draftDate || todayISO(),
    });
    this.setState({ draftDescription: '', draftAmount: '' });
  };

  _renderSummary() {
    const { incomeCents, spendingCents } = FinanceStore.monthTotals();
    const cards = [
      { label: localized('Balance'), value: FinanceStore.balanceCents(), className: '' },
      { label: localized('Income this month'), value: incomeCents, className: 'is-income' },
      { label: localized('Spending this month'), value: -spendingCents, className: 'is-expense' },
    ];
    return (
      <div className="moros-cards">
        {cards.map((card) => (
          <div className="moros-card" key={card.label}>
            <div className="moros-card-label">{card.label}</div>
            <div className={`moros-card-value ${card.className}`}>{formatCents(card.value)}</div>
          </div>
        ))}
      </div>
    );
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
    const transactions = FinanceStore.sortedByDate();

    return (
      <div className="moros-root moros-finance">
        <div className="moros-header">
          <h2>{localized('Finance')}</h2>
        </div>
        {this._renderSummary()}
        <div className="moros-toolbar-row">
          <input
            type="text"
            className="moros-input"
            placeholder={localized('Description')}
            value={this.state.draftDescription}
            onChange={(e) => this.setState({ draftDescription: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && this._onCreate()}
          />
          <input
            type="text"
            className="moros-input moros-input-amount"
            placeholder="0.00"
            value={this.state.draftAmount}
            onChange={(e) => this.setState({ draftAmount: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && this._onCreate()}
          />
          <select
            className="moros-select"
            value={this.state.draftKind}
            onChange={(e) => this.setState({ draftKind: e.target.value as TransactionKind })}
          >
            <option value="expense">{localized('Expense')}</option>
            <option value="income">{localized('Income')}</option>
          </select>
          <select
            className="moros-select"
            value={this.state.draftCategory}
            onChange={(e) => this.setState({ draftCategory: e.target.value })}
          >
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="moros-input moros-input-date"
            value={this.state.draftDate}
            onChange={(e) => this.setState({ draftDate: e.target.value })}
          />
          <button className="btn btn-emphasis" onClick={this._onCreate}>
            {localized('Add')}
          </button>
        </div>
        <div className="moros-scroll-region">
          {transactions.length > 0 ? (
            transactions.map((t) => this._renderTransaction(t))
          ) : (
            <div className="moros-empty">
              {localized('No transactions yet — record income or spending above.')}
            </div>
          )}
        </div>
      </div>
    );
  }
}
