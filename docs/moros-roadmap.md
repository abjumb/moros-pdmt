# Moros Productivity — Roadmap

Moros is a fork of Mailspring that turns the mail client into a lightweight all-in-one
productivity tool: **mail, tasks, personal finance, and an encrypted API key / password
vault**, presented with a UI/UX modeled closely on [Linear](https://linear.app).

The guiding constraints:

- **Lightweight.** Reuse Mailspring's existing infrastructure (package system, workspace
  sheets, flux stores, theming, build/installer pipeline) instead of adding new frameworks
  or dependencies.
- **Linear-grade UI.** Dark, dense, keyboard-friendly. Indigo `#5E6AD2` accent, Inter type
  stack, 13px base size, hairline borders, subtle hover states.
- **Mail stays untouched.** The sync engine, database, and mail features keep working
  exactly as upstream. New modules live in their own internal packages and persist data
  outside the mail database (JSON in the config directory + OS keychain for secrets).

## Phases

### Phase 1 — Foundation (this PR)

- [x] `ui-linear` theme package implementing Linear's visual language, set as the default
      theme for new profiles.
- [x] `moros` internal package with three root-level workspace sheets and sidebar entries:
  - **Tasks** — Linear-style issue list: status workflow (Backlog → Todo → In Progress →
    Done), priorities, grouped-by-status list, inline creation.
  - **Finance** — personal ledger: income/expense transactions with categories, monthly
    summary cards, running balance. Amounts stored as integer cents.
  - **Vault** — API key & password manager. Entry metadata (name, username, URL, kind) is
    stored locally; **secret values never touch disk in plaintext** — they are stored via
    `KeyManager`, which encrypts with Electron `safeStorage` (OS keychain).
- [x] Shared `MorosDataStore` base class: debounced atomic JSON persistence under
      `<config>/moros/`, change events via `MailspringStore`.

### Phase 2 — Module depth

- [x] Tasks: due dates with overdue highlighting; priority + due-date ordering within
      status groups.
- [x] Tasks: search/filter.
- [x] Tasks: "Create task from email" — thread-actions toolbar button files the
      selected thread(s) as tasks titled with their subjects.
- [ ] Tasks: labels, board (kanban) view, drag to reorder, keyboard shortcuts
      (`c` to create, `1-4` to set priority — Linear bindings), task → thread link-back.
- [x] Finance: month navigation (summary cards + transaction list scoped to the
      viewed month, with full-history toggle).
- [x] Finance: Origin-style overview ([useorigin.com](https://useorigin.com) as the
      design reference — the app dashboard itself is behind a login/bot wall, so the
      layout follows Origin's published overview structure): net worth headline with
      delta badge, 1W/1M/3M/1Y/All range pills, and a daily running-balance area chart.
- [x] Finance: configurable currency (header picker, persisted in
      `<config>/moros/settings.json`) with locale-tolerant amount parsing
      (`1,200.50` and `1.200,50` both work).
- [ ] Finance: budgets per category, CSV import, chart hover scrubber.
- [x] Vault: search, auto-clearing clipboard (30 s — only when the clipboard still
      holds the copied secret).
- [ ] Vault: TOTP support, secret strength meter, import from CSV/1Password/Bitwarden
      formats.

### Phase 2.5 — Tiling panels & desktop widgets

- [x] Panel system: every Moros module view is composed of tileable panels
      (`PanelGrid` + `PanelLayoutStore`): drag a panel header to rearrange,
      toggle half/full width, hide panels and restore them from the customize
      bar. Arrangements persist per module in `<config>/moros/layout.json`.
- [x] Pop-out desktop widgets: any panel can be popped out into its own small
      always-on-top window (`moros-widget` window type, pin toggle), using
      Mailspring's hot-window infrastructure. Data live-syncs across windows
      via file watchers on the shared JSON stores.
- [ ] Mail panels: thread list / message list tiling beyond Mailspring's
      existing layout modes and resizable columns.
- [ ] Windows 11 Widgets board integration. Not possible from a plain Electron
      window — requires MSIX packaging plus a COM `IWidgetProvider`; tracked for
      the Phase 5 installer work. Desktop floating widgets cover the gap.

### Phase 3 — Linear shell

- [x] Moros modules appear exactly once in the sidebar regardless of account
      count (sidebar extensions may now return `null` for sections they skip).
- [ ] App-level navigation rail (Mail / Tasks / Finance / Vault) replacing the
      sidebar injection entirely.
- [ ] Command palette (`Cmd/Ctrl+K`) covering navigation and module actions — Linear's
      primary interaction model. Mailspring's keymap + menu infrastructure already
      provides most of the plumbing.
- [x] Linear-style light theme variant (`ui-linear-light`).

### Plugins & custom themes (already supported upstream)

Mailspring ships with both: third-party plugins and themes load from
`<config>/packages`, `View → Install Theme or Plugin…` installs a package
folder via `PackageManager.installPackageFromPath`, the theme picker lists
custom themes (including `ui-linear`), and "Create a Theme" links the plugin
starter. Moros keeps this intact — `ui-linear` and `moros` are ordinary
packages, so the same APIs third-party authors use are exercised by the
product itself.

### Phase 4 — Rebrand

- [ ] Product naming: Mailspring → Moros (productName, window titles, about dialog,
      onboarding copy). Keep config directory and sync-engine identifiers compatible.
- [ ] New icon set / wordmark.

### Phase 5 — Distribution

- [ ] Windows installer built from the existing `electron-winstaller` + `app/build`
      pipeline, producing `MorosSetup.exe`.
- [ ] CI release workflow for tagged builds.

## Review gate

Every PR is reviewed by Greptile. A PR is only merged once Greptile's confidence score is
**4/5 or higher**; review feedback is addressed in follow-up commits on the same branch
until that bar is met.

## Data locations

| Module  | Data                          | Location                                   |
| ------- | ----------------------------- | ------------------------------------------ |
| Tasks   | tasks.json                    | `<config>/moros/tasks.json`                |
| Finance | transactions.json             | `<config>/moros/transactions.json`         |
| Vault   | entry metadata (no secrets)   | `<config>/moros/vault.json`                |
| Vault   | secret values                 | OS keychain via `KeyManager`/`safeStorage` |
