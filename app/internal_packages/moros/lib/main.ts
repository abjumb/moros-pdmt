import {
  localized,
  AccountStore,
  Actions,
  ComponentRegistry,
  ExtensionRegistry,
  WorkspaceStore,
} from 'mailspring-exports';

import {
  MorosTasksPerspective,
  MorosFinancePerspective,
  MorosVaultPerspective,
} from './moros-perspectives';
import TasksRoot from './tasks/tasks-root';
import CreateTaskButton from './tasks/create-task-button';
import FinanceRoot from './finance/finance-root';
import VaultRoot from './vault/vault-root';

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
    sheetName: 'MorosVault',
    locationName: 'MorosVaultContent',
    component: VaultRoot,
    perspectiveClass: MorosVaultPerspective,
    sidebarId: 'MorosVault',
    sidebarName: () => localized('Vault'),
    iconName: 'archive.png',
  },
];

const sidebarExtensions = MODULES.map((module) => ({
  name: module.sidebarId,
  sidebarItem(accountIds: string[]) {
    // Moros modules are account-agnostic — contribute exactly one sidebar
    // item: with multiple accounts that's the unified section only, so
    // skip the per-account sections (and the unified item's per-account
    // children, which arrive as single-id calls too).
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
  if (AppEnv.getWindowType() === 'moros-widget') {
    // Widget windows render a single panel, onboarding-style: one root
    // sheet with a Center column.
    const WidgetRoot = require('./widget-root').default;
    WorkspaceStore.defineSheet('Main', { root: true }, { list: ['Center'] });
    ComponentRegistry.register(WidgetRoot, { location: WorkspaceStore.Location.Center });
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
  if (AppEnv.getWindowType() === 'moros-widget') {
    ComponentRegistry.unregister(require('./widget-root').default);
    return;
  }
  ComponentRegistry.unregister(CreateTaskButton);
  for (const module of MODULES) {
    ComponentRegistry.unregister(module.component);
  }
  for (const extension of sidebarExtensions) {
    ExtensionRegistry.AccountSidebar.unregister(extension);
  }
}
