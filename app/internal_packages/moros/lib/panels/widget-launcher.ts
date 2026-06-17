import { widgetKey } from './widget-registry';

/** windowType used for Moros pop-out widget windows. */
export const MOROS_WIDGET_WINDOW_TYPE = 'moros-widget';

/** Shape of the windowProps a widget window reads back via AppEnv.getWindowProps(). */
export interface MorosWidgetWindowProps {
  /** `${moduleId}:${panelId}` — looked up against the widget registry. */
  widgetKey: string;
  /** Title to show in the OS window chrome. */
  title: string;
}

/**
 * Open a single panel in its own small, frameless, always-on-top widget window.
 *
 * Uses the standard renderer → main window-open path (`AppEnv.newWindow`, which
 * sends the `new-window` IPC handled in application.ts) — the same mechanism the
 * composer and thread popouts use. `coldStartOnly` forces a fresh BrowserWindow
 * (the pre-warmed "hot" window can't change `frame`/`alwaysOnTop` after creation),
 * and a stable `windowKey` means re-popping the same panel focuses the existing
 * widget instead of spawning a duplicate.
 */
export function openWidgetWindow(moduleId: string, panelId: string, title: string) {
  const key = widgetKey(moduleId, panelId);
  AppEnv.newWindow({
    windowType: MOROS_WIDGET_WINDOW_TYPE,
    // One widget window per panel; re-opening focuses the existing one.
    windowKey: `moros-widget-${key}`,
    title,
    // Compact, frameless, floating chrome for a desktop widget.
    frame: false,
    alwaysOnTop: true,
    width: 360,
    height: 320,
    minWidth: 240,
    minHeight: 160,
    // frame/alwaysOnTop can't be applied to a reused hot window, so force cold.
    coldStartOnly: true,
    windowProps: { widgetKey: key, title } as MorosWidgetWindowProps,
  });
}
