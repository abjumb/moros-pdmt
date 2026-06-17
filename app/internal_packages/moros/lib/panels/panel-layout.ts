/**
 * Pure, dependency-free layout model for the tiling-panel framework.
 *
 * A `PanelLayout` is an ordered list of panel records. Each record carries the
 * panel's id, whether it is currently hidden, and a relative `size` (a flex
 * weight — larger panels take more room; siblings share space in proportion).
 * The order of the array is the on-screen order, left/top to right/bottom.
 *
 * Every operation here is a pure function: given a layout (and inputs) it
 * returns a NEW layout without mutating the argument and without reading any
 * store, DOM, or global state. This keeps the model trivially testable and lets
 * the React layer treat layouts as immutable snapshots.
 */

export interface PanelState {
  /** Stable identifier for the panel within its module. */
  id: string;
  /** Whether the panel is collapsed out of the grid (restorable from a menu). */
  hidden: boolean;
  /** Relative flex weight; clamped to a sensible minimum. The default is 1. */
  size: number;
}

export type PanelLayout = PanelState[];

/** Default flex weight for a freshly added panel. */
export const DEFAULT_PANEL_SIZE = 1;

/** Floor for `size` so a panel can never be resized to nothing. */
export const MIN_PANEL_SIZE = 0.25;

/** A reasonable upper bound so one panel can't crowd out every sibling. */
export const MAX_PANEL_SIZE = 4;

function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_PANEL_SIZE;
  return Math.min(MAX_PANEL_SIZE, Math.max(MIN_PANEL_SIZE, size));
}

/** A fresh panel record for `id`, visible at the default size. */
export function makePanel(id: string): PanelState {
  return { id, hidden: false, size: DEFAULT_PANEL_SIZE };
}

/**
 * Move the panel `fromId` so it sits immediately before `toId` in the order.
 * If `fromId === toId`, or either id is absent, the layout is returned
 * unchanged. The moved panel keeps its hidden/size state; only its position
 * changes.
 */
export function reorder(layout: PanelLayout, fromId: string, toId: string): PanelLayout {
  if (fromId === toId) return layout;
  const fromIndex = layout.findIndex((p) => p.id === fromId);
  const toIndex = layout.findIndex((p) => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) return layout;

  const next = layout.slice();
  const [moved] = next.splice(fromIndex, 1);
  // After removing `moved`, recompute the target's index so we land in front of
  // it regardless of which direction the panel travelled.
  const insertAt = next.findIndex((p) => p.id === toId);
  next.splice(insertAt, 0, moved);
  return next;
}

/** Set the panel `id`'s relative size, clamped to [MIN, MAX]. */
export function resize(layout: PanelLayout, id: string, size: number): PanelLayout {
  let changed = false;
  const next = layout.map((p) => {
    if (p.id !== id) return p;
    changed = true;
    return { ...p, size: clampSize(size) };
  });
  return changed ? next : layout;
}

/** Flip the panel `id` between hidden and visible. */
export function toggleHidden(layout: PanelLayout, id: string): PanelLayout {
  let changed = false;
  const next = layout.map((p) => {
    if (p.id !== id) return p;
    changed = true;
    return { ...p, hidden: !p.hidden };
  });
  return changed ? next : layout;
}

/**
 * Reconcile a (possibly stale) saved layout with the module's current panel
 * set, returning a layout that contains exactly `defaultPanelIds`:
 *
 *  - panels still present keep their saved order, hidden flag, and size;
 *  - panels removed from the module are dropped;
 *  - panels new to the module are appended at the end (visible, default size),
 *    preserving the order they appear in `defaultPanelIds`.
 *
 * `saved` is treated as advisory and is never mutated. Passing `undefined`
 * (no saved layout yet) yields a fresh default layout.
 */
export function mergeDefaults(
  saved: PanelLayout | undefined,
  defaultPanelIds: string[]
): PanelLayout {
  const known = new Set(defaultPanelIds);
  const merged: PanelLayout = [];
  const seen = new Set<string>();

  // 1. Keep the saved panels that still exist, in their saved order.
  for (const panel of saved || []) {
    if (known.has(panel.id) && !seen.has(panel.id)) {
      merged.push({ id: panel.id, hidden: !!panel.hidden, size: clampSize(panel.size) });
      seen.add(panel.id);
    }
  }

  // 2. Append any panels that are new to the module.
  for (const id of defaultPanelIds) {
    if (!seen.has(id)) {
      merged.push(makePanel(id));
      seen.add(id);
    }
  }

  return merged;
}
