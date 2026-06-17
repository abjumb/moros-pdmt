import fs from 'fs';
import { localized, Actions, WorkspaceStore } from 'moros-exports';

import TasksStore from '../tasks/tasks-store';
import SubscriptionsStore, { SUBSCRIPTION_CATEGORIES } from '../subscriptions/subscriptions-store';
import FinanceStore, { parseTransactionsCsv } from '../finance/finance-store';
import BriefingStore from '../briefing/briefing-store';
import { PaletteCommand } from './filter-commands';

/**
 * Switch the active root sheet. Mirrors the exact mechanism the Moros sidebar
 * uses: see `app/internal_packages/moros/lib/main.ts:116` and the action
 * declaration in `app/src/flux/actions.ts` (`selectRootSheet`). The sheets are
 * defined in `main.ts`'s `activate()` via `WorkspaceStore.defineSheet(...)`, so
 * `WorkspaceStore.Sheet[sheetName]` is populated by the time the palette runs.
 */
function goToSheet(sheetName: string) {
  const sheet = WorkspaceStore.Sheet[sheetName];
  if (sheet) {
    Actions.selectRootSheet(sheet);
  }
}

/**
 * Replicates `FinanceRoot._onImportCsv` (finance-root.tsx:96) so the palette can
 * launch the same native file picker + CSV import without reaching into the
 * component. We jump to Finance first so the freshly imported rows are visible.
 */
function importTransactionsCsv() {
  goToSheet('MorosFinance');
  AppEnv.showOpenDialog(
    {
      title: localized('Import transactions'),
      buttonLabel: localized('Import'),
      properties: ['openFile'],
      filters: [
        { name: 'CSV', extensions: ['csv', 'txt'] },
        { name: localized('All Files'), extensions: ['*'] },
      ],
    },
    (paths) => {
      if (!paths || paths.length === 0) return;
      let text: string;
      try {
        text = fs.readFileSync(paths[0], 'utf8');
      } catch (err) {
        return;
      }
      const { rows } = parseTransactionsCsv(text);
      for (const row of rows) {
        FinanceStore.create(row);
      }
    }
  );
}

/**
 * Builds the full command set. Navigation commands reuse the sheet-switching
 * action; action commands call the relevant module store directly (the same
 * store methods the module UIs call). Every entry here is cheap and clean to
 * trigger from outside its component.
 *
 * Returned in display order; the pure `filterCommands` preserves this ordering.
 */
export function buildCommands(): PaletteCommand[] {
  return [
    // ----------------------------------------------------------- Navigate
    {
      id: 'nav:tasks',
      title: localized('Go to Tasks'),
      section: localized('Navigate'),
      keywords: 'todo board',
      run: () => goToSheet('MorosTasks'),
    },
    {
      id: 'nav:finance',
      title: localized('Go to Finance'),
      section: localized('Navigate'),
      keywords: 'money transactions budget net worth',
      run: () => goToSheet('MorosFinance'),
    },
    {
      id: 'nav:subscriptions',
      title: localized('Go to Subscriptions'),
      section: localized('Navigate'),
      keywords: 'recurring billing',
      run: () => goToSheet('MorosSubscriptions'),
    },
    {
      id: 'nav:briefing',
      title: localized('Go to Briefing'),
      section: localized('Navigate'),
      keywords: 'ai summary digest',
      run: () => goToSheet('MorosBriefing'),
    },
    {
      id: 'nav:keynest',
      title: localized('Go to KeyNest'),
      section: localized('Navigate'),
      keywords: 'vault password secret api key',
      run: () => goToSheet('MorosKeyNest'),
    },

    // ------------------------------------------------------------- Actions
    {
      id: 'tasks:new',
      title: localized('New task'),
      section: localized('Tasks'),
      keywords: 'create add todo',
      run: () => {
        TasksStore.create({ title: localized('New task'), status: 'todo', priority: 'none' });
        goToSheet('MorosTasks');
      },
    },
    {
      id: 'finance:import-csv',
      title: localized('Import transactions (CSV)'),
      section: localized('Finance'),
      keywords: 'upload file bank statement',
      run: importTransactionsCsv,
    },
    {
      id: 'subscriptions:new',
      title: localized('Add subscription'),
      section: localized('Subscriptions'),
      keywords: 'create recurring manual',
      run: () => {
        SubscriptionsStore.create({
          name: localized('New subscription'),
          vendorEmail: '',
          amountCents: 0,
          cadence: 'monthly',
          nextRenewal: '',
          category: SUBSCRIPTION_CATEGORIES[0],
          status: 'active',
          source: 'manual',
        });
        goToSheet('MorosSubscriptions');
      },
    },
    {
      id: 'briefing:generate',
      title: localized('Generate briefing'),
      section: localized('Briefing'),
      keywords: 'ai summary refresh',
      run: () => {
        goToSheet('MorosBriefing');
        BriefingStore.generate();
      },
    },
  ];
}
