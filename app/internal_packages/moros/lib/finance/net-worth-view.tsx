import React from 'react';
import { localized } from 'moros-exports';
import FinanceStore, { MorosTransaction, formatCents } from './finance-store';
import MorosSettingsStore from '../moros-settings-store';

// Range pills modeled on Origin's net worth dashboard (1W/1M/3M/1Y/ALL).
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '1Y', label: '1Y', days: 365 },
  { key: 'ALL', label: localized('All'), days: null },
];

const CHART_WIDTH = 600;
const CHART_HEIGHT = 140;

interface NetWorthViewState {
  transactions: ReadonlyArray<MorosTransaction>;
  rangeKey: string;
}

/**
 * Origin-style net worth overview: a large running-balance headline with a
 * period delta badge, range pills, and a daily running-balance area chart
 * (pure SVG — no charting dependency).
 */
export default class NetWorthView extends React.Component<
  Record<string, unknown>,
  NetWorthViewState
> {
  static displayName = 'NetWorthView';

  _unlisten?: () => void;
  _unlistenSettings?: () => void;

  state: NetWorthViewState = {
    transactions: FinanceStore.items(),
    rangeKey: '1M',
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

  _chartGeometry(series: { date: string; cents: number }[]) {
    const values = series.map((point) => point.cents);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const spread = max - min || 1;
    const stepX = series.length > 1 ? CHART_WIDTH / (series.length - 1) : CHART_WIDTH;
    const points = series.map((point, i) => {
      const x = series.length > 1 ? i * stepX : CHART_WIDTH / 2;
      const y = CHART_HEIGHT - 8 - ((point.cents - min) / spread) * (CHART_HEIGHT - 16);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return {
      line: points.join(' '),
      area: `0,${CHART_HEIGHT} ${points.join(' ')} ${CHART_WIDTH},${CHART_HEIGHT}`,
    };
  }

  render() {
    const range = RANGES.find((r) => r.key === this.state.rangeKey) || RANGES[1];
    const series = FinanceStore.balanceSeries(range.days);
    const current = series.length ? series[series.length - 1].cents : 0;
    const first = series.length ? series[0].cents : 0;
    const deltaCents = current - first;
    const deltaPercent = first !== 0 ? (deltaCents / Math.abs(first)) * 100 : null;
    const geometry = this._chartGeometry(series);

    return (
      <div className="moros-networth">
        <div className="moros-networth-headline">
          <div>
            <div className="moros-card-label">{localized('Net worth')}</div>
            <div className="moros-networth-value">{formatCents(current)}</div>
            <div className={`moros-networth-delta ${deltaCents >= 0 ? 'is-income' : 'is-expense'}`}>
              {deltaCents >= 0 ? '▲' : '▼'} {formatCents(Math.abs(deltaCents))}
              {deltaPercent !== null ? ` (${Math.abs(deltaPercent).toFixed(1)}%)` : ''}
            </div>
          </div>
          <div className="moros-range-pills">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className={`moros-range-pill ${r.key === this.state.rangeKey ? 'is-active' : ''}`}
                onClick={() => this.setState({ rangeKey: r.key })}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <svg
          className="moros-networth-chart"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
        >
          <polygon className="moros-chart-area" points={geometry.area} />
          <polyline className="moros-chart-line" points={geometry.line} fill="none" />
        </svg>
      </div>
    );
  }
}
