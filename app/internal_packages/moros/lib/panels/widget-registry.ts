import React from 'react';

/**
 * Registry mapping a panel to the standalone component a widget window should
 * render for it. Panel ids are only unique *within* a module's grid, so widget
 * keys are namespaced as `${moduleId}:${panelId}` (e.g. `finance:networth`).
 *
 * Only panels backed by a self-contained component (one that subscribes to its
 * own stores and needs no props) can be popped out — those re-render in any
 * window the moment the underlying store reloads from disk. A panel whose
 * content is an inline render method of its module root is *not* registered, so
 * the pop-out affordance simply won't appear for it.
 */
export interface WidgetDescriptor {
  /** Module the panel belongs to, e.g. 'finance'. */
  moduleId: string;
  /** Panel id within that module's grid, e.g. 'networth'. */
  panelId: string;
  /** Human title for the widget window. */
  title: string;
}

type WidgetComponent = React.ComponentType<Record<string, unknown>>;

interface WidgetEntry {
  component: WidgetComponent;
  defaultTitle: string;
}

const registry: { [widgetKey: string]: WidgetEntry } = {};

/** The composite, globally-unique key for a panel. */
export function widgetKey(moduleId: string, panelId: string): string {
  return `${moduleId}:${panelId}`;
}

/** Inverse of `widgetKey`; tolerant of panel ids that themselves contain ':'. */
export function parseWidgetKey(key: string): { moduleId: string; panelId: string } | null {
  const idx = key.indexOf(':');
  if (idx <= 0 || idx === key.length - 1) return null;
  return { moduleId: key.slice(0, idx), panelId: key.slice(idx + 1) };
}

/** Register the component to render when this panel is popped out. */
export function registerWidget(
  moduleId: string,
  panelId: string,
  defaultTitle: string,
  component: WidgetComponent
) {
  registry[widgetKey(moduleId, panelId)] = { component, defaultTitle };
}

/** True if the panel has a registered widget component (i.e. can be popped out). */
export function hasWidget(moduleId: string, panelId: string): boolean {
  return Object.prototype.hasOwnProperty.call(registry, widgetKey(moduleId, panelId));
}

/** Look up the component for a widget key, or null if none is registered. */
export function widgetComponentForKey(key: string): WidgetComponent | null {
  const entry = registry[key];
  return entry ? entry.component : null;
}

/** The default window title for a widget key, or null if none is registered. */
export function widgetTitleForKey(key: string): string | null {
  const entry = registry[key];
  return entry ? entry.defaultTitle : null;
}
