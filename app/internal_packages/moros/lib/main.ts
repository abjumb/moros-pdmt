import { Actions, ComponentRegistry, WorkspaceStore } from 'moros-exports';

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
  CommandPaletteController.unregister();
  ComponentRegistry.unregister(CreateTaskButton);
  for (const module of MODULES) {
    ComponentRegistry.unregister(module.component);
  }
  if (AppEnv.isMainWindow()) {
    ComponentRegistry.unregister(NavRail);
  }
}
