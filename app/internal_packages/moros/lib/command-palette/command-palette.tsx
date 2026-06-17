import React from 'react';
import { localized } from 'moros-exports';

import { PaletteCommand, filterCommands } from './filter-commands';

interface CommandPaletteProps {
  /** Full, ordered command set. Filtered live against the query. */
  commands: ReadonlyArray<PaletteCommand>;
  /** Called when the palette should close (Escape, backdrop click, or run). */
  onClose: () => void;
}

interface CommandPaletteState {
  query: string;
  /** Index into the *filtered* list of the highlighted row. */
  highlight: number;
}

/**
 * Linear-style command palette: a centered overlay with a search box and a
 * filtered, grouped command list. Keyboard: the input autofocuses on mount;
 * ArrowUp/Down move the highlight (clamped), Enter runs it, Escape closes.
 * Clicking a row runs it; clicking the backdrop closes.
 *
 * The component is self-contained (its own fixed overlay) rather than going
 * through the core `Modal`, whose opaque white chrome and close button don't
 * suit a dense dark palette. Mounting/closing is driven by the package's
 * activate() via a dedicated DOM container — see `command-palette/index.tsx`.
 */
export default class CommandPalette extends React.Component<
  CommandPaletteProps,
  CommandPaletteState
> {
  static displayName = 'MorosCommandPalette';

  state: CommandPaletteState = { query: '', highlight: 0 };

  _inputEl: HTMLInputElement | null = null;
  _listEl: HTMLDivElement | null = null;

  componentDidMount() {
    if (this._inputEl) this._inputEl.focus();
  }

  _filtered(): PaletteCommand[] {
    return filterCommands(this.props.commands, this.state.query);
  }

  _onQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Reset the highlight to the first row whenever the result set changes, so
    // Enter always targets the top (best) match after typing.
    this.setState({ query: event.target.value, highlight: 0 });
  };

  _moveHighlight(delta: number) {
    const count = this._filtered().length;
    if (count === 0) return;
    const next = Math.min(Math.max(this.state.highlight + delta, 0), count - 1);
    this.setState({ highlight: next }, this._scrollHighlightIntoView);
  }

  _scrollHighlightIntoView = () => {
    if (!this._listEl) return;
    const row = this._listEl.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' });
    }
  };

  _run(command: PaletteCommand | undefined) {
    if (!command) return;
    // Close first so a command that opens a native dialog (e.g. CSV import)
    // isn't racing the overlay teardown.
    this.props.onClose();
    command.run();
  }

  _onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this._moveHighlight(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._moveHighlight(-1);
        break;
      case 'Enter':
        event.preventDefault();
        this._run(this._filtered()[this.state.highlight]);
        break;
      case 'Escape':
        event.preventDefault();
        this.props.onClose();
        break;
      default:
        break;
    }
  };

  _renderRows(commands: PaletteCommand[]) {
    const rows: React.ReactNode[] = [];
    let lastSection: string | null = null;

    commands.forEach((command, index) => {
      if (command.section !== lastSection) {
        lastSection = command.section;
        rows.push(
          <div className="moros-cmdk-section" role="presentation" key={`section-${command.id}`}>
            {command.section}
          </div>
        );
      }
      const selected = index === this.state.highlight;
      rows.push(
        <div
          key={command.id}
          id={`moros-cmdk-option-${command.id}`}
          className={`moros-cmdk-option${selected ? ' is-selected' : ''}`}
          role="option"
          aria-selected={selected}
          // Use onMouseDown so the row runs before the input's blur fires.
          onMouseDown={(event) => {
            event.preventDefault();
            this._run(command);
          }}
          onMouseEnter={() => this.setState({ highlight: index })}
        >
          <span className="moros-cmdk-option-title">{command.title}</span>
        </div>
      );
    });

    return rows;
  }

  render() {
    const filtered = this._filtered();
    const activeId =
      filtered[this.state.highlight] && `moros-cmdk-option-${filtered[this.state.highlight].id}`;

    return (
      <div
        className="moros-cmdk-backdrop"
        role="presentation"
        onMouseDown={this.props.onClose}
        onKeyDown={this._onKeyDown}
      >
        <div
          className="moros-cmdk"
          role="dialog"
          aria-modal="true"
          aria-label={localized('Command palette')}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <label className="moros-cmdk-input-row">
            <span className="moros-cmdk-visually-hidden">{localized('Search commands')}</span>
            <input
              ref={(el) => {
                this._inputEl = el;
              }}
              className="moros-cmdk-input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              placeholder={localized('Type a command or search…')}
              value={this.state.query}
              role="combobox"
              aria-expanded="true"
              aria-controls="moros-cmdk-list"
              aria-activedescendant={activeId || undefined}
              onChange={this._onQueryChange}
            />
          </label>
          <div
            className="moros-cmdk-list"
            id="moros-cmdk-list"
            role="listbox"
            aria-label={localized('Commands')}
            ref={(el) => {
              this._listEl = el;
            }}
          >
            {filtered.length === 0 ? (
              <div className="moros-cmdk-empty" role="presentation">
                {localized('No matching commands')}
              </div>
            ) : (
              this._renderRows(filtered)
            )}
          </div>
        </div>
      </div>
    );
  }
}
