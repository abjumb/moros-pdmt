import {
  localized,
  AccountStore,
  Actions,
  ComponentRegistry,
  ExtensionRegistry,
  WorkspaceStore,
} from 'moros-exports';

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

const MODULES = [
  {
    sheetName: 'MorosTasks',
    locationName: 'MorosTasksContent',
    component: TasksRoot,
    perspectiveClass: MorosTasksPerspective,
    sidebarId: 'MorosTasks',
    sidebarName: () => localized('Tasks'),
    iconName: 'today.png',
  },
  {
    sheetName: 'MorosFinance',
    locationName: 'MorosFinanceContent',
    component: FinanceRoot,
    perspectiveClass: MorosFinancePerspective,
    sidebarId: 'MorosFinance',
    sidebarName: () => localized('Finance'),
    iconName: 'tag.png',
  },
  {
    sheetName: 'MorosSubscriptions',
    locationName: 'MorosSubscriptionsContent',
    component: SubscriptionsRoot,
    perspectiveClass: MorosSubscriptionsPerspective,
    sidebarId: 'MorosSubscriptions',
    sidebarName: () => localized('Subscriptions'),
    iconName: 'reminders.png',
  },
  {
    sheetName: 'MorosBriefing',
    locationName: 'MorosBriefingContent',
    component: BriefingRoot,
    perspectiveClass: MorosBriefingPerspective,
    sidebarId: 'MorosBriefing',
    sidebarName: () => localized('Briefing'),
    iconName: 'activity.png',
  },
  {
    sheetName: 'MorosKeyNest',
    locationName: 'MorosKeyNestContent',
    component: KeyNestRoot,
    perspectiveClass: MorosKeyNestPerspective,
    sidebarId: 'MorosKeyNest',
    sidebarName: () => localized('KeyNest'),
    iconName: 'archive.png',
  },
];

const sidebarExtensions = MODULES.map((module) => ({
  name: module.sidebarId,
  sidebarItem(accountIds: string[]) {
    // Moros modules are account-agnostic — contribute exactly one sidebar
    // item. With multiple accounts the sidebar renders a unified section
    // (all account ids) plus a per-account section for each; returning null
    // for the single-id calls keeps modules from repeating under every
    // account (and drops the unified item's per-account children too).
    if (accountIds.length === 1 && AccountStore.accounts().length > 1) {
      return null;
    }
    return {
      id: module.sidebarId,
      name: module.sidebarName(),
      iconName: module.iconName,
      perspective: new module.perspectiveClass(accountIds),
    };
  },
}));

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

  for (const extension of sidebarExtensions) {
    ExtensionRegistry.AccountSidebar.register(extension);
  }

  ComponentRegistry.register(CreateTaskButton, { role: 'ThreadActionsToolbarButton' });

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
  ComponentRegistry.unregister(CreateTaskButton);
  for (const module of MODULES) {
    ComponentRegistry.unregister(module.component);
  }
  for (const extension of sidebarExtensions) {
    ExtensionRegistry.AccountSidebar.unregister(extension);
  }
}
