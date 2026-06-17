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
  /** Index into the current series being scrubbed, or null when not hovering. */
  hoverIndex: number | null;
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

  _svgRef = React.createRef<SVGSVGElement>();

  state: NetWorthViewState = {
    transactions: FinanceStore.items(),
    rangeKey: '1M',
    hoverIndex: null,
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
    // Per-point coordinates, reused by both the polyline and the hover scrubber.
    const coords = series.map((point, i) => {
      const x = series.length > 1 ? i * stepX : CHART_WIDTH / 2;
      const y = CHART_HEIGHT - 8 - ((point.cents - min) / spread) * (CHART_HEIGHT - 16);
      return { x, y };
    });
    const points = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`);
    return {
      coords,
      line: points.join(' '),
      area: `0,${CHART_HEIGHT} ${points.join(' ')} ${CHART_WIDTH},${CHART_HEIGHT}`,
    };
  }

  /** Map a pointer event to the nearest series index, accounting for scaling. */
  _indexFromPointer(e: React.PointerEvent<SVGSVGElement>, seriesLength: number) {
    const svg = this._svgRef.current;
    if (!svg || seriesLength === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return null;
    // viewBox is 0..CHART_WIDTH; convert the client x into that space.
    const ratio = (e.clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const index = Math.round(clamped * (seriesLength - 1));
    return Math.min(Math.max(index, 0), seriesLength - 1);
  }

  _onPointerMove = (e: React.PointerEvent<SVGSVGElement>, seriesLength: number) => {
    const hoverIndex = this._indexFromPointer(e, seriesLength);
    if (hoverIndex !== this.state.hoverIndex) this.setState({ hoverIndex });
  };

  _onPointerLeave = () => {
    if (this.state.hoverIndex !== null) this.setState({ hoverIndex: null });
  };

  _onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>, seriesLength: number) => {
    if (seriesLength === 0) return;
    const current = this.state.hoverIndex;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const base = current === null ? (e.key === 'ArrowRight' ? -1 : seriesLength) : current;
      const next = e.key === 'ArrowRight' ? base + 1 : base - 1;
      this.setState({ hoverIndex: Math.min(Math.max(next, 0), seriesLength - 1) });
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.setState({ hoverIndex: 0 });
    } else if (e.key === 'End') {
      e.preventDefault();
      this.setState({ hoverIndex: seriesLength - 1 });
    } else if (e.key === 'Escape') {
      this.setState({ hoverIndex: null });
    }
  };

  _hoverDateLabel(iso: string) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  render() {
    const range = RANGES.find((r) => r.key === this.state.rangeKey) || RANGES[1];
    const series = FinanceStore.balanceSeries(range.days);
    const current = series.length ? series[series.length - 1].cents : 0;
    const first = series.length ? series[0].cents : 0;
    const deltaCents = current - first;
    const deltaPercent = first !== 0 ? (deltaCents / Math.abs(first)) * 100 : null;
    const geometry = this._chartGeometry(series);

    const hoverIndex =
      this.state.hoverIndex !== null && this.state.hoverIndex < series.length
        ? this.state.hoverIndex
        : null;
    const hoverPoint = hoverIndex !== null ? series[hoverIndex] : null;
    const hoverCoord = hoverIndex !== null ? geometry.coords[hoverIndex] : null;
    // Tooltip is positioned as a percentage of width so it tracks the scaled SVG.
    const hoverXPercent = hoverCoord !== null ? (hoverCoord.x / CHART_WIDTH) * 100 : 0;
    // Keep the tooltip from spilling off either edge.
    const tooltipAlign = hoverXPercent > 70 ? 'is-right' : hoverXPercent < 30 ? 'is-left' : '';

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
        <div className="moros-networth-chart-wrap">
          <svg
            ref={this._svgRef}
            className="moros-networth-chart"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            tabIndex={0}
            role="img"
            aria-label={localized('Net worth over time. Use arrow keys to inspect points.')}
            onPointerMove={(e) => this._onPointerMove(e, series.length)}
            onPointerDown={(e) => this._onPointerMove(e, series.length)}
            onPointerLeave={this._onPointerLeave}
            onKeyDown={(e) => this._onKeyDown(e, series.length)}
            onBlur={this._onPointerLeave}
          >
            <polygon className="moros-chart-area" points={geometry.area} />
            <polyline className="moros-chart-line" points={geometry.line} fill="none" />
            {hoverCoord !== null ? (
              <>
                <line
                  className="moros-chart-crosshair"
                  x1={hoverCoord.x}
                  y1={0}
                  x2={hoverCoord.x}
                  y2={CHART_HEIGHT}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="moros-chart-dot"
                  cx={hoverCoord.x}
                  cy={hoverCoord.y}
                  r={3}
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>
          {hoverPoint !== null ? (
            <div
              className={`moros-chart-tooltip ${tooltipAlign}`}
              style={{ left: `${hoverXPercent}%` }}
            >
              <div className="moros-chart-tooltip-date">
                {this._hoverDateLabel(hoverPoint.date)}
              </div>
              <div className="moros-chart-tooltip-value">{formatCents(hoverPoint.cents)}</div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}
