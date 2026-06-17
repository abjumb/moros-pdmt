import { Actions, ComponentRegistry, WorkspaceStore, localized } from 'moros-exports';

import {
  MorosTasksPerspective,
  MorosFinancePerspective,
  MorosKeyNestPerspective,
  MorosSubscriptionsPerspective,
  MorosBriefingPerspective,
} from './moros-perspectives';
import TasksRoot from './tasks/tasks-root';
import CreateTaskButton from './tasks/create-task-button';
import FinanceRoot from './finance/finance-root';
import KeyNestRoot from './keynest/keynest-root';
import SubscriptionsRoot from './subscriptions/subscriptions-root';
import BriefingRoot from './briefing/briefing-root';
import CommandPaletteController from './command-palette';
import NavRail from './nav-rail';
import NetWorthView from './finance/net-worth-view';
import MorosWidgetWindow from './panels/widget-window';
import { MOROS_WIDGET_WINDOW_TYPE } from './panels/widget-launcher';
import MorosSettingsStore from './moros-settings-store';
import TasksStore from './tasks/tasks-store';
import FinanceStore from './finance/finance-store';
import BudgetsStore from './finance/finance-budgets-store';
import KeyNestStore from './keynest/keynest-store';
import SubscriptionsStore from './subscriptions/subscriptions-store';
import BriefingStore from './briefing/briefing-store';
import { registerWidget } from './panels/widget-registry';

// Panels that can be popped out into their own widget window. Only standalone
// components (those that subscribe to their own Moros store and need no props)
// are eligible — the file-watch live-sync then keeps every window in step.
// Registered once at module load so both the main window (to show the pop-out
// affordance) and widget windows (to render content) share the same map.
registerWidget('finance', 'networth', localized('Net worth'), NetWorthView);

const MODULES = [
  {
    sheetName: 'MorosTasks',
    locationName: 'MorosTasksContent',
    component: TasksRoot,
    perspectiveClass: MorosTasksPerspective,
  },
  {
    sheetName: 'MorosFinance',
    locationName: 'MorosFinanceContent',
    component: FinanceRoot,
    perspectiveClass: MorosFinancePerspective,
  },
  {
    sheetName: 'MorosSubscriptions',
    locationName: 'MorosSubscriptionsContent',
    component: SubscriptionsRoot,
    perspectiveClass: MorosSubscriptionsPerspective,
  },
  {
    sheetName: 'MorosBriefing',
    locationName: 'MorosBriefingContent',
    component: BriefingRoot,
    perspectiveClass: MorosBriefingPerspective,
  },
  {
    sheetName: 'MorosKeyNest',
    locationName: 'MorosKeyNestContent',
    component: KeyNestRoot,
    perspectiveClass: MorosKeyNestPerspective,
  },
];

export function activate() {
  // Widget popout windows render a single panel's component into the Center
  // location and nothing else — no sheets, nav rail, or command palette. The
  // component is resolved from the widget registry by MorosWidgetWindow using
  // the window's props. This mirrors the composer's per-window-type activation.
  if (AppEnv.getWindowType() === MOROS_WIDGET_WINDOW_TYPE) {
    ComponentRegistry.register(MorosWidgetWindow, {
      location: WorkspaceStore.Location.Center,
    });
    return;
  }

  for (const module of MODULES) {
    WorkspaceStore.defineSheet(
      module.sheetName,
      { root: true },
      { list: ['RootSidebar', module.locationName] }
    );
    ComponentRegistry.register(module.component, {
      location: WorkspaceStore.Location[module.locationName],
    });
  }

  // App-level navigation rail (Phase 3 "Linear shell"). Registered once into the
  // app-wide Global.Header location (rendered a single time by SheetContainer —
  // see app/src/sheet-container.tsx), it replaces the per-module account-sidebar
  // items the package used to inject via ExtensionRegistry.AccountSidebar. Every
  // module is still reachable here (and via the command palette); Mail's own
  // account/folder sidebar in the account-sidebar package is untouched.
  if (AppEnv.isMainWindow()) {
    ComponentRegistry.register(NavRail, { location: WorkspaceStore.Sheet.Global.Header });
  }

  ComponentRegistry.register(CreateTaskButton, { role: 'ThreadActionsToolbarButton' });

  // Command palette (Cmd/Ctrl-K). Registers the toggle command + overlay; the
  // keystroke is bound in keymaps/command-palette.json.
  CommandPaletteController.register();

  // Restore the previously focused module after a relaunch (the saved
  // perspective can't be deserialized by the core mailbox code).
  const savedType =
    AppEnv.savedState && AppEnv.savedState.perspective && AppEnv.savedState.perspective.type;
  const savedModule = MODULES.find((module) => module.perspectiveClass.name === savedType);
  if (savedModule) {
    Actions.selectRootSheet(WorkspaceStore.Sheet[savedModule.sheetName]);
  }
}

export function deactivate() {
  // Release every Moros store's cross-window file watcher (and pending save
  // timer) in all window types so deactivation doesn't leak fs.watch handles —
  // each store is instantiated in every window via its root component's import.
  for (const store of [
    MorosSettingsStore,
    TasksStore,
    FinanceStore,
    BudgetsStore,
    KeyNestStore,
    SubscriptionsStore,
    BriefingStore,
  ]) {
    store.dispose();
  }
  if (AppEnv.getWindowType() === MOROS_WIDGET_WINDOW_TYPE) {
    ComponentRegistry.unregister(MorosWidgetWindow);
    return;
  }
  CommandPaletteController.unregister();
  ComponentRegistry.unregister(CreateTaskButton);
  for (const module of MODULES) {
    ComponentRegistry.unregister(module.component);
  }
  if (AppEnv.isMainWindow()) {
    ComponentRegistry.unregister(NavRail);
  }
}
