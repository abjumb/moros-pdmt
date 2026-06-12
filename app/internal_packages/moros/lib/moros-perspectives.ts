import { WorkspaceStore, MailboxPerspective } from 'mailspring-exports';

/**
 * Sidebar perspectives for the Moros sheets. Like ActivityMailboxPerspective,
 * these have no threads — selecting one simply switches the workspace to the
 * module's root sheet.
 */
class MorosPerspective extends MailboxPerspective {
  threads() {
    return null;
  }
  canReceiveThreadsFromAccountIds() {
    return false;
  }
  unreadCount() {
    return 0;
  }
}

export class MorosTasksPerspective extends MorosPerspective {
  sheet() {
    return WorkspaceStore.Sheet.MorosTasks;
  }
}

export class MorosFinancePerspective extends MorosPerspective {
  sheet() {
    return WorkspaceStore.Sheet.MorosFinance;
  }
}

export class MorosVaultPerspective extends MorosPerspective {
  sheet() {
    return WorkspaceStore.Sheet.MorosVault;
  }
}
