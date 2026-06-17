// Pure-function tests for the tiling-panel layout model. We import the model
// directly from source — the plugin is not registered in moros-exports. The
// model has no store/DOM dependencies, so these are plain pure-function tests.
import {
  PanelLayout,
  makePanel,
  reorder,
  resize,
  toggleHidden,
  mergeDefaults,
  MIN_PANEL_SIZE,
  MAX_PANEL_SIZE,
} from '../internal_packages/moros/lib/panels/panel-layout';
import PanelLayoutStore from '../internal_packages/moros/lib/panels/panel-layout-store';

function layoutOf(ids: string[]): PanelLayout {
  return ids.map((id) => makePanel(id));
}

describe('Moros panel layout model', () => {
  describe('reorder', () => {
    it('moves a panel to sit before the target', () => {
      const layout = layoutOf(['a', 'b', 'c']);
      const next = reorder(layout, 'c', 'a');
      expect(next.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    });

    it('moves a panel forward, landing in front of the target', () => {
      const layout = layoutOf(['a', 'b', 'c']);
      const next = reorder(layout, 'a', 'c');
      expect(next.map((p) => p.id)).toEqual(['b', 'a', 'c']);
    });

    it('preserves the moved panel hidden flag and size', () => {
      const layout: PanelLayout = [
        { id: 'a', hidden: false, size: 1 },
        { id: 'b', hidden: true, size: 2 },
        { id: 'c', hidden: false, size: 1 },
      ];
      const next = reorder(layout, 'b', 'a');
      expect(next[0].id).toBe('b');
      expect(next[0].hidden).toBe(true);
      expect(next[0].size).toBe(2);
    });

    it('returns the same layout when from and to are equal', () => {
      const layout = layoutOf(['a', 'b']);
      expect(reorder(layout, 'a', 'a')).toBe(layout);
    });

    it('returns the same layout when an id is unknown', () => {
      const layout = layoutOf(['a', 'b']);
      expect(reorder(layout, 'x', 'a')).toBe(layout);
      expect(reorder(layout, 'a', 'x')).toBe(layout);
    });

    it('does not mutate the input layout', () => {
      const layout = layoutOf(['a', 'b', 'c']);
      reorder(layout, 'c', 'a');
      expect(layout.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('resize', () => {
    it('sets a panel size', () => {
      const layout = layoutOf(['a', 'b']);
      const next = resize(layout, 'b', 2.5);
      expect(next[1].size).toBe(2.5);
      expect(next[0].size).toBe(1);
    });

    it('clamps below the minimum', () => {
      const layout = layoutOf(['a']);
      const next = resize(layout, 'a', 0.001);
      expect(next[0].size).toBe(MIN_PANEL_SIZE);
    });

    it('clamps above the maximum', () => {
      const layout = layoutOf(['a']);
      const next = resize(layout, 'a', 99);
      expect(next[0].size).toBe(MAX_PANEL_SIZE);
    });

    it('returns the same layout for an unknown id', () => {
      const layout = layoutOf(['a']);
      expect(resize(layout, 'x', 2)).toBe(layout);
    });
  });

  describe('toggleHidden', () => {
    it('hides a visible panel', () => {
      const layout = layoutOf(['a', 'b']);
      const next = toggleHidden(layout, 'a');
      expect(next[0].hidden).toBe(true);
      expect(next[1].hidden).toBe(false);
    });

    it('restores a hidden panel', () => {
      const layout: PanelLayout = [{ id: 'a', hidden: true, size: 1 }];
      const next = toggleHidden(layout, 'a');
      expect(next[0].hidden).toBe(false);
    });

    it('returns the same layout for an unknown id', () => {
      const layout = layoutOf(['a']);
      expect(toggleHidden(layout, 'x')).toBe(layout);
    });

    it('does not mutate the input layout', () => {
      const layout = layoutOf(['a']);
      toggleHidden(layout, 'a');
      expect(layout[0].hidden).toBe(false);
    });
  });

  describe('mergeDefaults', () => {
    it('builds a default layout when nothing is saved', () => {
      const merged = mergeDefaults(undefined, ['a', 'b', 'c']);
      expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'c']);
      expect(merged[0].hidden).toBe(false);
      expect(merged[0].size).toBe(1);
    });

    it('appends a panel new to the module at the end', () => {
      const saved = layoutOf(['a', 'b']);
      const merged = mergeDefaults(saved, ['a', 'b', 'c']);
      expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    });

    it('drops a panel removed from the module', () => {
      const saved = layoutOf(['a', 'gone', 'b']);
      const merged = mergeDefaults(saved, ['a', 'b']);
      expect(merged.map((p) => p.id)).toEqual(['a', 'b']);
      expect(merged.map((p) => p.id)).toContain('a');
    });

    it('preserves the saved order, hidden flag, and size of surviving panels', () => {
      const saved: PanelLayout = [
        { id: 'c', hidden: false, size: 2 },
        { id: 'a', hidden: true, size: 1 },
      ];
      const merged = mergeDefaults(saved, ['a', 'b', 'c']);
      // Saved order (c before a) is kept; the new panel b is appended.
      expect(merged.map((p) => p.id)).toEqual(['c', 'a', 'b']);
      expect(merged[0].size).toBe(2);
      expect(merged[1].hidden).toBe(true);
    });

    it('keeps every default panel exactly once', () => {
      const saved = layoutOf(['a', 'a', 'b']);
      const merged = mergeDefaults(saved, ['a', 'b']);
      expect(merged.length).toBe(2);
      expect(merged.map((p) => p.id)).toEqual(['a', 'b']);
    });
  });
});

describe('Moros panel layout store', () => {
  // The store is a singleton backed by panel-layouts.json; in spec mode writes
  // land in the throwaway spec config dir. Reset its in-memory state per test.
  beforeEach(() => {
    PanelLayoutStore._reset();
  });

  it('reconciles an empty store to the module default layout', () => {
    const layout = PanelLayoutStore.forModule('finance', ['summary', 'budgets']);
    expect(layout.map((p) => p.id)).toEqual(['summary', 'budgets']);
  });

  it('returns a saved layout reconciled against the current panel set', () => {
    PanelLayoutStore.save('finance', [
      { id: 'budgets', hidden: true, size: 1 },
      { id: 'summary', hidden: false, size: 2 },
    ]);
    // A new panel 'transactions' joined the module since the save.
    const layout = PanelLayoutStore.forModule('finance', ['summary', 'budgets', 'transactions']);
    expect(layout.map((p) => p.id)).toEqual(['budgets', 'summary', 'transactions']);
    expect(layout[0].hidden).toBe(true);
    expect(layout[1].size).toBe(2);
  });

  it('keeps layouts isolated per module id', () => {
    PanelLayoutStore.save('finance', [{ id: 'summary', hidden: true, size: 1 }]);
    const tasks = PanelLayoutStore.forModule('tasks', ['board', 'list']);
    expect(tasks.map((p) => p.id)).toEqual(['board', 'list']);
    expect(tasks[0].hidden).toBe(false);
  });
});
