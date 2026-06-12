import {
  localized,
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
  for (const module of MODULES) {
    ComponentRegistry.unregister(module.component);
  }
  for (const extension of sidebarExtensions) {
    ExtensionRegistry.AccountSidebar.unregister(extension);
  }
}
