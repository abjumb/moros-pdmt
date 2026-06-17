import React from 'react';
import { localized, Actions, WorkspaceStore } from 'moros-exports';
import { RetinaImg } from 'moros-component-kit';

import { navItems, isActive, NavRailItem } from './nav-rail-items';

interface NavRailState {
  /** `id` of the current root sheet (`WorkspaceStore.rootSheet().id`). */
  currentSheetName: string | null;
}

/**
 * App-level navigation rail (Phase 3 "Linear shell").
 *
 * A single, persistent left-edge rail that switches the root sheet between
 * Mail and each Moros module. It is registered once into the app-wide
 * `WorkspaceStore.Sheet.Global.Header` location (see `lib/main.ts`), which
 * `SheetContainer` renders exactly once regardless of the active sheet
 * (`app/src/sheet-container.tsx` Header `InjectedComponentSet`). Because that
 * region is a thin horizontal band, the rail itself is laid out with
 * `position: fixed` on the left edge via `styles/moros.less`, and the workspace
 * is given a matching left inset so content never sits under the rail.
 *
 * Navigation uses the same mechanism the command palette uses
 * (`lib/command-palette/commands.ts` `goToSheet`):
 * `Actions.selectRootSheet(WorkspaceStore.Sheet[name])`.
 *
 * Active-item resolution is delegated to the pure `isActive` helper
 * (`nav-rail-items.ts`) so it can be unit-tested without the store.
 */
export default class NavRail extends React.Component<Record<string, never>, NavRailState> {
  static displayName = 'MorosNavRail';

  // We position the rail ourselves (fixed, full-height) rather than letting the
  // injected-component flexbox wrap it.
  static containerRequired = false;

  _unsubscribe: (() => void) | null = null;

  constructor(props: Record<string, never>) {
    super(props);
    this.state = this._getStateFromStores();
  }

  componentDidMount() {
    this._unsubscribe = WorkspaceStore.listen(this._onStoreChange);
  }

  componentWillUnmount() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  _onStoreChange = () => {
    this.setState(this._getStateFromStores());
  };

  _getStateFromStores(): NavRailState {
    const root = WorkspaceStore.rootSheet();
    return { currentSheetName: root ? root.id : null };
  }

  _onSelect(item: NavRailItem) {
    const sheet = WorkspaceStore.Sheet[item.sheetName];
    if (sheet) {
      Actions.selectRootSheet(sheet);
    }
  }

  render() {
    const { currentSheetName } = this.state;

    return (
      <nav className="moros-nav-rail" aria-label={localized('Workspaces')}>
        {navItems().map((item) => {
          const active = isActive(item, currentSheetName);
          return (
            <button
              key={item.id}
              type="button"
              className={`moros-nav-rail-item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={() => this._onSelect(item)}
            >
              <span className="moros-nav-rail-icon" aria-hidden="true">
                <RetinaImg name={item.iconName} mode={RetinaImg.Mode.ContentIsMask} />
              </span>
              <span className="moros-nav-rail-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }
}
