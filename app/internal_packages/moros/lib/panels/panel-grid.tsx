import React from 'react';
import { localized } from 'moros-exports';
import PanelLayoutStore from './panel-layout-store';
import {
  PanelLayout,
  MIN_PANEL_SIZE,
  MAX_PANEL_SIZE,
  reorder,
  resize,
  toggleHidden,
} from './panel-layout';

/** A single panel's static metadata: its id, title, and rendered content. */
export interface PanelDef {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface PanelGridProps {
  /** Module key the layout is persisted under (e.g. 'finance'). */
  moduleId: string;
  /** The panels to render, in their default order. */
  panels: PanelDef[];
}

interface PanelGridState {
  layout: PanelLayout;
  /** Id of the panel currently being dragged, or null. */
  draggingId: string | null;
  /** Panel the drop indicator points at, and whether it sits after that panel. */
  dropTargetId: string | null;
  dropAfter: boolean;
  /** Whether the "hidden panels" restore menu is open. */
  hiddenMenuOpen: boolean;
}

// Resizing nudges the dragged panel's flex weight by this much per pixel. The
// grid is laid out as flex rows, so a panel's share is its size relative to its
// visible siblings; a small per-pixel factor gives a smooth, bounded drag.
const RESIZE_FACTOR = 0.005;

/**
 * Renders a module's panels as a flexible, rearrangeable grid driven by a
 * persisted `PanelLayout`. Panels can be dragged to reorder (HTML5 DnD,
 * dependency-free — the same approach as the Tasks list), resized via a drag
 * handle on the right edge, and hidden/restored. Every change runs through the
 * pure layout model and is persisted via `PanelLayoutStore`.
 *
 * The grid only knows about layout; each panel's content is supplied by the
 * caller, so existing module sub-views are wrapped, never rewritten.
 */
export default class PanelGrid extends React.Component<PanelGridProps, PanelGridState> {
  static displayName = 'PanelGrid';

  _unlisten?: () => void;
  // Transient state for an in-flight resize drag (pointer events, not DnD).
  _resizing: { id: string; startX: number; startSize: number } | null = null;

  constructor(props: PanelGridProps) {
    super(props);
    this.state = {
      layout: PanelLayoutStore.forModule(
        props.moduleId,
        props.panels.map((p) => p.id)
      ),
      draggingId: null,
      dropTargetId: null,
      dropAfter: false,
      hiddenMenuOpen: false,
    };
  }

  componentDidMount() {
    // Pick up layout changes saved elsewhere (e.g. another instance of the grid).
    this._unlisten = PanelLayoutStore.listen(() => this._syncFromStore());
  }

  componentDidUpdate(prevProps: PanelGridProps) {
    // If the module's panel set changes (panels added/removed), re-reconcile.
    const prevIds = prevProps.panels.map((p) => p.id).join('|');
    const nextIds = this.props.panels.map((p) => p.id).join('|');
    if (prevProps.moduleId !== this.props.moduleId || prevIds !== nextIds) {
      this._syncFromStore();
    }
  }

  componentWillUnmount() {
    if (this._unlisten) this._unlisten();
    this._endResize();
  }

  _syncFromStore() {
    this.setState({
      layout: PanelLayoutStore.forModule(
        this.props.moduleId,
        this.props.panels.map((p) => p.id)
      ),
    });
  }

  /** Apply a pure layout transform, then persist and re-render. */
  _commit(layout: PanelLayout) {
    this.setState({ layout });
    PanelLayoutStore.save(this.props.moduleId, layout);
  }

  // ----------------------------------------------------- Drag-to-reorder
  //
  // HTML5 drag-and-drop, dependency-free, mirroring the Tasks list: dragging a
  // panel's header reorders it within the grid. The drop indicator sits before
  // or after the hovered panel based on the cursor's position within it.

  _onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    this.setState({ draggingId: id });
  };

  _onDragOver = (e: React.DragEvent, id: string) => {
    const { draggingId } = this.state;
    if (!draggingId || draggingId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    // The grid flows horizontally, so split on the X midpoint.
    const after = e.clientX - rect.left > rect.width / 2;
    if (this.state.dropTargetId !== id || this.state.dropAfter !== after) {
      this.setState({ dropTargetId: id, dropAfter: after });
    }
  };

  _onDrop = (e: React.DragEvent, targetId: string) => {
    const { draggingId, dropAfter } = this.state;
    if (!draggingId || draggingId === targetId) {
      this._clearDrag();
      return;
    }
    e.preventDefault();
    // To land *after* the target, reorder in front of the target's successor.
    const visible = this.state.layout.filter((p) => !p.hidden);
    const targetVisibleIndex = visible.findIndex((p) => p.id === targetId);
    let layout: PanelLayout;
    if (dropAfter && targetVisibleIndex >= 0 && targetVisibleIndex < visible.length - 1) {
      layout = reorder(this.state.layout, draggingId, visible[targetVisibleIndex + 1].id);
    } else if (dropAfter) {
      // Dropping after the last visible panel: move to the very end.
      layout = this._moveToEnd(draggingId);
    } else {
      layout = reorder(this.state.layout, draggingId, targetId);
    }
    this._clearDrag();
    this._commit(layout);
  };

  /** Reorder helper: place `id` last in the order. */
  _moveToEnd(id: string): PanelLayout {
    const without = this.state.layout.filter((p) => p.id !== id);
    const moved = this.state.layout.find((p) => p.id === id);
    return moved ? [...without, moved] : this.state.layout;
  }

  _clearDrag = () => {
    this.setState({ draggingId: null, dropTargetId: null, dropAfter: false });
  };

  _dragClasses(id: string) {
    const dragging = this.state.draggingId === id ? ' is-dragging' : '';
    if (this.state.dropTargetId !== id) return dragging;
    return `${dragging} ${this.state.dropAfter ? 'drop-after' : 'drop-before'}`;
  }

  // ---------------------------------------------------------------- Resize
  //
  // Dragging a panel's right-edge handle adjusts its relative `size`. We track
  // pointer movement on the window so the drag continues even when the cursor
  // leaves the thin handle.

  _onResizeStart = (e: React.PointerEvent, id: string) => {
    const panel = this.state.layout.find((p) => p.id === id);
    if (!panel) return;
    e.preventDefault();
    this._resizing = { id, startX: e.clientX, startSize: panel.size };
    window.addEventListener('pointermove', this._onResizeMove);
    window.addEventListener('pointerup', this._endResize);
  };

  _onResizeMove = (e: PointerEvent) => {
    if (!this._resizing) return;
    const { id, startX, startSize } = this._resizing;
    const delta = (e.clientX - startX) * RESIZE_FACTOR;
    const next = Math.min(MAX_PANEL_SIZE, Math.max(MIN_PANEL_SIZE, startSize + delta));
    // Update live for a responsive feel; persist on release.
    this.setState({ layout: resize(this.state.layout, id, next) });
  };

  _endResize = () => {
    window.removeEventListener('pointermove', this._onResizeMove);
    window.removeEventListener('pointerup', this._endResize);
    if (this._resizing) {
      this._resizing = null;
      // Persist the final size now that the drag is done.
      PanelLayoutStore.save(this.props.moduleId, this.state.layout);
    }
  };

  // ------------------------------------------------------------ Hide/restore

  _onHide = (id: string) => {
    this._commit(toggleHidden(this.state.layout, id));
  };

  _onRestore = (id: string) => {
    this._commit(toggleHidden(this.state.layout, id));
    this.setState({ hiddenMenuOpen: false });
  };

  _panelDef(id: string): PanelDef | undefined {
    return this.props.panels.find((p) => p.id === id);
  }

  _renderHiddenMenu(hiddenIds: string[]) {
    if (hiddenIds.length === 0) return null;
    return (
      <div className="moros-panel-hidden-menu">
        <button
          type="button"
          className="btn moros-panel-hidden-toggle"
          aria-expanded={this.state.hiddenMenuOpen}
          onClick={() => this.setState((prev) => ({ hiddenMenuOpen: !prev.hiddenMenuOpen }))}
        >
          {localized('Hidden panels')} ({hiddenIds.length})
        </button>
        {this.state.hiddenMenuOpen ? (
          <div className="moros-panel-hidden-list" role="menu">
            {hiddenIds.map((id) => {
              const def = this._panelDef(id);
              if (!def) return null;
              return (
                <button
                  type="button"
                  key={id}
                  className="moros-panel-hidden-item"
                  role="menuitem"
                  onClick={() => this._onRestore(id)}
                >
                  {localized('Show %@', def.title)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  _renderPanel(id: string, size: number) {
    const def = this._panelDef(id);
    if (!def) return null;
    return (
      <section
        className={`moros-panel${this._dragClasses(id)}`}
        key={id}
        style={{ flexGrow: size, flexBasis: 0 }}
        aria-label={def.title}
        onDragOver={(e) => this._onDragOver(e, id)}
        onDrop={(e) => this._onDrop(e, id)}
      >
        <header
          className="moros-panel-header"
          draggable
          title={localized('Drag to reorder')}
          onDragStart={(e) => this._onDragStart(e, id)}
          onDragEnd={this._clearDrag}
        >
          <span className="moros-panel-grip" aria-hidden="true">
            ⠿
          </span>
          <span className="moros-panel-title">{def.title}</span>
          <button
            type="button"
            className="moros-panel-hide"
            title={localized('Hide panel')}
            aria-label={localized('Hide %@', def.title)}
            onClick={() => this._onHide(id)}
          >
            &times;
          </button>
        </header>
        <div className="moros-panel-body">{def.content}</div>
        <div
          className="moros-panel-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={localized('Resize %@', def.title)}
          title={localized('Drag to resize')}
          onPointerDown={(e) => this._onResizeStart(e, id)}
        />
      </section>
    );
  }

  render() {
    const visible = this.state.layout.filter((p) => !p.hidden);
    const hiddenIds = this.state.layout.filter((p) => p.hidden).map((p) => p.id);

    return (
      <div className="moros-panel-grid-wrap">
        {this._renderHiddenMenu(hiddenIds)}
        <div className="moros-panel-grid">
          {visible.map((p) => this._renderPanel(p.id, p.size))}
        </div>
      </div>
    );
  }
}
