import { localized } from 'moros-exports';

/**
 * A single entry in the app-level navigation rail. `sheetName` is the
 * `WorkspaceStore.Sheet[...]` key the entry navigates to via
 * `Actions.selectRootSheet` (see `nav-rail.tsx`). `iconName` resolves against
 * the shared `app/static/images/source-list/` icon set used elsewhere by the
 * Moros modules (see `main.ts` `MODULES[*].iconName`).
 */
export interface NavRailItem {
  /** Stable identifier, also used as the React key. */
  id: string;
  /** `WorkspaceStore.Sheet` key this item selects as the root sheet. */
  sheetName: string;
  /** Localized, human-readable label. */
  label: string;
  /** Icon file resolved from `static/images/source-list/`. */
  iconName: string;
}

/**
 * The ordered rail contents: Mail first, then each Moros module. `sheetName`
 * values match the sheets registered in `main.ts` (`WorkspaceStore.defineSheet`)
 * and the core Mail sheet (`Threads`, defined in
 * `app/src/flux/stores/workspace-store.ts`). Kept as a pure factory (no store
 * reads) so it is trivially testable in isolation — see
 * `app/spec/moros-nav-rail-spec.ts`.
 *
 * The labels mirror the module sidebar names previously contributed in
 * `main.ts`, so removing the per-module account-sidebar injection does not
 * change the wording the user sees.
 */
export function navItems(): NavRailItem[] {
  return [
    { id: 'mail', sheetName: 'Threads', label: localized('Mail'), iconName: 'inbox.png' },
    { id: 'tasks', sheetName: 'MorosTasks', label: localized('Tasks'), iconName: 'today.png' },
    {
      id: 'finance',
      sheetName: 'MorosFinance',
      label: localized('Finance'),
      iconName: 'tag.png',
    },
    {
      id: 'subscriptions',
      sheetName: 'MorosSubscriptions',
      label: localized('Subscriptions'),
      iconName: 'reminders.png',
    },
    {
      id: 'briefing',
      sheetName: 'MorosBriefing',
      label: localized('Briefing'),
      iconName: 'activity.png',
    },
    {
      id: 'keynest',
      sheetName: 'MorosKeyNest',
      label: localized('KeyNest'),
      iconName: 'archive.png',
    },
  ];
}

/**
 * Pure active-state resolution: an item is active when its `sheetName` matches
 * the name of the current root sheet. `currentSheetName` is read from
 * `WorkspaceStore.rootSheet().id` by the component; kept separate so the rule
 * can be unit-tested without touching the store.
 */
export function isActive(item: NavRailItem, currentSheetName: string | null | undefined): boolean {
  return !!currentSheetName && item.sheetName === currentSheetName;
}
