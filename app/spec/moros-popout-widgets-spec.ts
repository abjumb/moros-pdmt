// Pure-unit tests for the pop-out widget plumbing. These exercise the parts
// that have no window/DOM/fs dependency: the panelId<->component registry, the
// widget-key (de)serialization, and the file-watch self-write detector. The
// multi-window behavior itself (opening the widget window, always-on-top, and
// cross-window live sync) is verified by hand — it cannot run in CI.
import React from 'react';
import {
  widgetKey,
  parseWidgetKey,
  registerWidget,
  hasWidget,
  widgetComponentForKey,
  widgetTitleForKey,
} from '../internal_packages/moros/lib/panels/widget-registry';
import MorosFileWatch from '../internal_packages/moros/lib/moros-file-watch';

// A trivial standalone component to register; we only assert identity/lookup.
const FakeWidget: React.ComponentType<Record<string, unknown>> = () => null;

describe('Moros pop-out widget registry', () => {
  describe('widgetKey / parseWidgetKey', () => {
    it('builds a namespaced key from module and panel ids', () => {
      expect(widgetKey('finance', 'networth')).toBe('finance:networth');
    });

    it('round-trips a key back to its parts', () => {
      const parsed = parseWidgetKey('finance:networth');
      expect(parsed).toEqual({ moduleId: 'finance', panelId: 'networth' });
    });

    it('keeps colons that belong to the panel id', () => {
      const parsed = parseWidgetKey(widgetKey('mod', 'a:b:c'));
      expect(parsed).toEqual({ moduleId: 'mod', panelId: 'a:b:c' });
    });

    it('rejects malformed keys', () => {
      expect(parseWidgetKey('nocolon')).toBe(null);
      expect(parseWidgetKey(':leading')).toBe(null);
      expect(parseWidgetKey('trailing:')).toBe(null);
    });
  });

  describe('registration and lookup', () => {
    it('reports a panel as poppable only after it is registered', () => {
      expect(hasWidget('specmod', 'alpha')).toBe(false);
      registerWidget('specmod', 'alpha', 'Alpha', FakeWidget);
      expect(hasWidget('specmod', 'alpha')).toBe(true);
    });

    it('resolves the registered component and title by key', () => {
      registerWidget('specmod', 'beta', 'Beta Widget', FakeWidget);
      const key = widgetKey('specmod', 'beta');
      expect(widgetComponentForKey(key)).toBe(FakeWidget);
      expect(widgetTitleForKey(key)).toBe('Beta Widget');
    });

    it('returns null for an unregistered key', () => {
      expect(widgetComponentForKey('specmod:unknown')).toBe(null);
      expect(widgetTitleForKey('specmod:unknown')).toBe(null);
    });
  });
});

describe('Moros file-watch self-write detection', () => {
  // Never call start(), so no real fs.watch is ever created in specs.
  function makeWatch() {
    return new MorosFileWatch('/tmp/moros-spec-never-read.json', () => {});
  }

  it('does not treat any content as a self-write before the first write', () => {
    const watch = makeWatch();
    expect(watch.isSelfWrite('anything')).toBe(false);
  });

  it('recognizes the exact content it last noted as a self-write', () => {
    const watch = makeWatch();
    const payload = JSON.stringify([{ id: '1' }], null, 2);
    watch.noteWrite(payload);
    expect(watch.isSelfWrite(payload)).toBe(true);
  });

  it('treats different content as an external change', () => {
    const watch = makeWatch();
    watch.noteWrite('[1]');
    expect(watch.isSelfWrite('[2]')).toBe(false);
  });

  it('tracks only the most recent write', () => {
    const watch = makeWatch();
    watch.noteWrite('[1]');
    watch.noteWrite('[2]');
    expect(watch.isSelfWrite('[1]')).toBe(false);
    expect(watch.isSelfWrite('[2]')).toBe(true);
  });

  it('consumeSelfWrite suppresses the matching write exactly once', () => {
    const watch = makeWatch();
    watch.noteWrite('[1]');
    // The echo of our own write is suppressed once...
    expect(watch.consumeSelfWrite('[1]')).toBe(true);
    // ...but a later *external* write with the same content is NOT suppressed
    // (the marker is one-shot), so an X -> Y -> X cross-window update isn't lost.
    expect(watch.consumeSelfWrite('[1]')).toBe(false);
  });

  it('consumeSelfWrite does not consume the marker on a non-match', () => {
    const watch = makeWatch();
    watch.noteWrite('[1]');
    expect(watch.consumeSelfWrite('[2]')).toBe(false);
    // The unrelated check left the marker intact, so our real echo still matches.
    expect(watch.consumeSelfWrite('[1]')).toBe(true);
  });

  it('start(false) is inert — no watcher and stop() is safe', () => {
    const watch = makeWatch();
    watch.start(false);
    // Nothing was created; stop() must not throw.
    expect(() => watch.stop()).not.toThrow();
  });
});
