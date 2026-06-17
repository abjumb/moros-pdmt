import fs from 'fs';
import React from 'react';
import { localized } from 'moros-exports';
import FinanceStore, {
  CATEGORIES,
  CategoryBudgetSummary,
  MorosTransaction,
  TransactionKind,
  budgetSummary,
  currentMonthPrefix,
  formatCents,
  monthPrefixLabel,
  parseAmountToCents,
  parseTransactionsCsv,
  shiftMonthPrefix,
  todayISO,
} from './finance-store';
import BudgetsStore from './finance-budgets-store';
import MorosSettingsStore, { CURRENCIES } from '../moros-settings-store';
import NetWorthView from './net-worth-view';

interface FinanceRootState {
  transactions: ReadonlyArray<MorosTransaction>;
  /** Bumped whenever budgets change so the spent-vs-budget panel re-renders. */
  budgetsVersion: number;
  /** 'yyyy-mm' month being viewed, or null for the full history. */
  viewMonth: string | null;
  currency: string;
  draftDescription: string;
  draftAmount: string;
  draftKind: TransactionKind;
  draftCategory: string;
  draftDate: string;
  /** Whether the spent-vs-budget panel is expanded for editing. */
  budgetsOpen: boolean;
  /** Transient "Imported N, skipped M" notice after a CSV import. */
  importNotice: string | null;
}

export default class FinanceRoot extends React.Component<
  Record<string, unknown>,
  FinanceRootState
> {
  static displayName = 'FinanceRoot';

  _unlisten?: () => void;
  _unlistenSettings?: () => void;
  _unlistenBudgets?: () => void;

  state: FinanceRootState = {
    transactions: FinanceStore.items(),
    budgetsVersion: 0,
    viewMonth: currentMonthPrefix(),
    currency: MorosSettingsStore.currency(),
    draftDescription: '',
    draftAmount: '',
    draftKind: 'expense',
    draftCategory: CATEGORIES[0],
    draftDate: todayISO(),
    budgetsOpen: false,
    importNotice: null,
  };

  componentDidMount() {
    this._unlisten = FinanceStore.listen(() =>
      this.setState({ transactions: FinanceStore.items() })
    );
    this._unlistenSettings = MorosSettingsStore.listen(() =>
      this.setState({ currency: MorosSettingsStore.currency() })
    );
    this._unlistenBudgets = BudgetsStore.listen(() =>
      this.setState((prev) => ({ budgetsVersion: prev.budgetsVersion + 1 }))
    );
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
    if (this._unlistenSettings) this._unlistenSettings();
    if (this._unlistenBudgets) this._unlistenBudgets();
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

  _onImportCsv = () => {
    AppEnv.showOpenDialog(
      {
        title: localized('Import transactions'),
        buttonLabel: localized('Import'),
        properties: ['openFile'],
        filters: [
          { name: 'CSV', extensions: ['csv', 'txt'] },
          { name: localized('All Files'), extensions: ['*'] },
        ],
      },
      (paths) => {
        if (!paths || paths.length === 0) return;
        this._importCsvFile(paths[0]);
      }
    );
  };

  _importCsvFile(filepath: string) {
    let text: string;
    try {
      text = fs.readFileSync(filepath, 'utf8');
    } catch (err) {
      this.setState({ importNotice: localized('Could not read the selected file.') });
      return;
    }

    const { rows, skipped } = parseTransactionsCsv(text);
    for (const row of rows) {
      FinanceStore.create(row);
    }

    let notice: string;
    if (rows.length === 0) {
      notice = localized('No transactions found in that file.');
    } else if (skipped > 0) {
      notice = localized(
        'Imported %1$@ transactions, skipped %2$@.',
        `${rows.length}`,
        `${skipped}`
      );
    } else {
      notice = localized('Imported %@ transactions.', `${rows.length}`);
    }
    this.setState({ importNotice: notice });
  }

  _onSetBudget(category: string, value: string) {
    const cents = parseAmountToCents(value);
    BudgetsStore.setBudget(category, cents || 0);
  }

  _renderMonthNav() {
    const { viewMonth } = this.state;
    return (
      <div className="moros-month-nav">
        <button
          className="btn"
          title={localized('Previous month')}
          onClick={() =>
            this.setState({
              viewMonth: shiftMonthPrefix(viewMonth || currentMonthPrefix(), -1),
            })
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
            this.setState({
              viewMonth: shiftMonthPrefix(viewMonth || currentMonthPrefix(), 1),
            })
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
    );
  }

  _renderSummary() {
    const month = this.state.viewMonth || currentMonthPrefix();
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

  _renderBudgetBar(summary: CategoryBudgetSummary) {
    const hasBudget = summary.budgetCents > 0;
    // Cap the visible fill at 100% even when over budget.
    const fillPercent = hasBudget ? Math.min(summary.ratio, 1) * 100 : 0;
    const detail = hasBudget
      ? `${formatCents(summary.spentCents)} / ${formatCents(summary.budgetCents)}`
      : formatCents(summary.spentCents);
    return (
      <div
        className={`moros-budget-row ${summary.overBudget ? 'is-over' : ''}`}
        key={summary.category}
      >
        <span className="moros-budget-category">{summary.category}</span>
        <div
          className="moros-budget-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={hasBudget ? summary.budgetCents : undefined}
          aria-valuenow={summary.spentCents}
          aria-label={`${summary.category}: ${detail}`}
        >
          <div className="moros-budget-fill" style={{ width: `${fillPercent.toFixed(1)}%` }} />
        </div>
        <span className="moros-budget-detail">{detail}</span>
      </div>
    );
  }

  _renderBudgets(month: string) {
    const monthTx = FinanceStore.sortedByDate(month);
    const summaries = budgetSummary(monthTx, BudgetsStore.asMap());
    const overCount = summaries.filter((s) => s.overBudget).length;

    return (
      <div className="moros-budgets">
        <div className="moros-section-header">
          <div className="moros-section-title">{localized('Budgets')}</div>
          {overCount > 0 ? (
            <span className="moros-budget-over-count">
              {localized('%@ over budget', `${overCount}`)}
            </span>
          ) : null}
          <button
            className="btn moros-section-action"
            onClick={() => this.setState((prev) => ({ budgetsOpen: !prev.budgetsOpen }))}
          >
            {this.state.budgetsOpen ? localized('Done') : localized('Edit budgets')}
          </button>
        </div>
        {this.state.budgetsOpen ? (
          <div className="moros-budget-editor">
            {CATEGORIES.map((category) => {
              const existing = BudgetsStore.forCategory(category);
              return (
                <div className="moros-budget-edit-line" key={category}>
                  <span className="moros-budget-category">{category}</span>
                  <input
                    type="text"
                    className="moros-input moros-input-amount"
                    placeholder={localized('No budget')}
                    defaultValue={existing ? (existing.budgetCents / 100).toFixed(2) : ''}
                    onBlur={(e) => this._onSetBudget(category, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                </div>
              );
            })}
          </div>
        ) : summaries.length > 0 ? (
          summaries.map((summary) => this._renderBudgetBar(summary))
        ) : (
          <div className="moros-empty">
            {localized('No spending or budgets this month — set budgets to track them.')}
          </div>
        )}
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
    const month = this.state.viewMonth || currentMonthPrefix();
    const transactions = FinanceStore.sortedByDate(this.state.viewMonth);

    return (
      <div className="moros-root moros-finance">
        <div className="moros-header moros-header-split">
          <div>
            <h2>{localized('Finance')}</h2>
            {this._renderMonthNav()}
          </div>
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
        <NetWorthView />
        {this._renderSummary()}
        {this._renderBudgets(month)}
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
          <button
            className="btn moros-import-csv"
            title={localized('Import transactions from a CSV file')}
            onClick={this._onImportCsv}
          >
            {localized('Import CSV')}
          </button>
        </div>
        {this.state.importNotice ? (
          <div className="moros-import-notice">{this.state.importNotice}</div>
        ) : null}
        <div className="moros-scroll-region">
          {transactions.length > 0 ? (
            transactions.map((t) => this._renderTransaction(t))
          ) : (
            <div className="moros-empty">
              {this.state.viewMonth && this.state.transactions.length > 0
                ? localized('No transactions in this month.')
                : localized('No transactions yet — record income or spending above.')}
            </div>
          )}
        </div>
      </div>
    );
  }
}
