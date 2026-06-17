// Direct imports from source — the plugin is not registered in moros-exports.
// We test only the pure `navItems` / `isActive` helpers, which have no UI,
// store, or sheet-switching dependencies (mirrors moros-command-palette-spec).
import { navItems, isActive, NavRailItem } from '../internal_packages/moros/lib/nav-rail-items';

describe('nav rail navItems', () => {
  it('lists Mail first', () => {
    expect(navItems()[0].id).toBe('mail');
  });

  it('points Mail at the core Threads root sheet', () => {
    const mail = navItems().find((item) => item.id === 'mail');
    expect(mail.sheetName).toBe('Threads');
  });

  it('includes each Moros module sheet', () => {
    const sheetNames = navItems().map((item) => item.sheetName);
    expect(sheetNames).toContain('MorosTasks');
    expect(sheetNames).toContain('MorosFinance');
    expect(sheetNames).toContain('MorosSubscriptions');
    expect(sheetNames).toContain('MorosBriefing');
    expect(sheetNames).toContain('MorosKeyNest');
  });

  it('lists Mail plus the five modules', () => {
    expect(navItems().length).toBe(6);
  });

  it('gives every item a non-empty label, icon, and stable id', () => {
    for (const item of navItems()) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.iconName.length).toBeGreaterThan(0);
      expect(item.id.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids across items', () => {
    const ids = navItems().map((item) => item.id);
    const unique = ids.filter((id, index) => ids.indexOf(id) === index);
    expect(unique.length).toBe(ids.length);
  });

  it('returns a fresh array on each call (no shared mutable state)', () => {
    const a = navItems();
    const b = navItems();
    expect(a === b).toBe(false);
    expect(a).toEqual(b);
  });
});

describe('nav rail isActive', () => {
  const mail: NavRailItem = navItems()[0];
  const tasks: NavRailItem = navItems().find((item) => item.id === 'tasks');

  it('is active when the current root sheet matches the item sheet', () => {
    expect(isActive(mail, 'Threads')).toBe(true);
    expect(isActive(tasks, 'MorosTasks')).toBe(true);
  });

  it('is inactive when the current root sheet is a different sheet', () => {
    expect(isActive(mail, 'MorosTasks')).toBe(false);
    expect(isActive(tasks, 'Threads')).toBe(false);
  });

  it('is inactive when there is no current root sheet', () => {
    expect(isActive(mail, null)).toBe(false);
    expect(isActive(mail, undefined)).toBe(false);
    expect(isActive(mail, '')).toBe(false);
  });

  it('marks exactly one item active for a given root sheet', () => {
    const items = navItems();
    const activeForFinance = items.filter((item) => isActive(item, 'MorosFinance'));
    expect(activeForFinance.length).toBe(1);
    expect(activeForFinance[0].id).toBe('finance');
  });
});
