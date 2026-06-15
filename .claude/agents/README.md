# Moros Agent Orchestration

This directory defines a team of specialized subagents for the Moros codebase and
the rules for routing work to them. The **orchestrator** is the lead Claude
session: it triages a request (a GitHub issue, a PR review comment, or a direct
ask), delegates to the right specialist(s) via the `Agent`/Task tool, integrates
their results, runs review + tests, then commits, pushes, and opens/updates a PR.

Subagents run with their own context window, so delegating keeps the
orchestrator's context focused on coordination rather than file dumps.

## The team

| Agent | Owns | Typical trigger |
|-------|------|-----------------|
| `flux-core` | `app/src/flux` models/stores/actions, observable DB, query subscriptions | "thread/message model", "store doesn't update", "query subscription" |
| `sync-engine` | `mailsync-process`/`mailsync-bridge`/`action-bridge`, `flux/tasks/*`, C++ boundary | "task not running", "syncback", "undo/redo", "delta" |
| `plugin-architect` | `app/internal_packages/*`, PackageManager, registries, windowTypes, themes | "new plugin", "activate/deactivate", "register component", "theme" |
| `ui-react` | `app/src/components`, component-kit, plugin views, LESS, accessibility | "render", "list", "keyboard/ARIA", "styling", "a11y plan" |
| `calendar-contacts` | CalDAV/CardDAV, ICS/vCard, events, RSVP, `plans/caldav-*` & `carddav-*` | "calendar", "recurring event", "contact sync", "ICS" |
| `qa-test` | Jasmine `app/spec`, Playwright e2e, lint/typecheck | "run the tests", "verify", "lint is red", "add coverage" |
| `code-reviewer` | read-only diff review against Moros conventions | after any implementer finishes, before commit |
| `build-release` | `app/build`, packaging (dmg/winstaller/snap), `scripts/`, CI | "build broken", "installer", "release", "CI" |

## Routing rules

1. **One owner per change area.** Pick the agent whose scope matches the *primary*
   file(s) being changed. When a change spans layers, the orchestrator sequences
   specialists rather than one agent reaching outside its lane:
   - Data + UI feature → `flux-core` (data) then `ui-react` (view).
   - New task type → `sync-engine` (task) and flag any `mailsync/` C++ work.
   - Calendar feature → `calendar-contacts` (logic) + `ui-react` (calendar UI).
   - New plugin → `plugin-architect` (scaffold/registration) + the relevant
     domain agent for its internals.
2. **Always search both `app/src/` and `app/internal_packages/`.** The codebase
   spans both; a single-tree search misses consumers (see CLAUDE.md).
3. **Review before commit.** Run `code-reviewer` on the diff; address Blockers
   and Should-fix items (loop back to the implementer) before committing.
4. **Verify before claiming done.** Use `qa-test` for lint/typecheck/specs.
   Report honestly if the environment can't run them (fresh clones have no
   `node_modules`; Electron specs need a working build).
5. **Respect the invariants** every agent encodes: the Electron DB is read-only,
   mutations go through Tasks + the sync engine, plugins deactivate symmetrically,
   and accessibility must not regress.

## Issue / PR workflow (the "project")

The defined backlog is the **open GitHub issues and PRs** in `abjumb/moros-pdmt`.
For each item the orchestrator runs this loop:

1. **Triage** — read the issue/PR (`mcp__github__*`). Classify (bug / feature /
   chore / build) and map it to an owning agent via the table above. If the ask
   is ambiguous or architecturally significant, ask the user before building.
2. **Plan** — for non-trivial items, have the owning agent (or the `Plan` agent)
   produce a short plan; the relevant `plans/` or `docs/` file is often the
   source of truth.
3. **Implement** — delegate to the specialist on the feature branch
   (`claude/jolly-hawking-gugsz9`). Keep changes minimal and convention-matching.
4. **Review** — `code-reviewer` on the diff; fix findings.
5. **Verify** — `qa-test` (lint:check, typecheck, focused specs at minimum).
6. **Ship** — commit with a descriptive message, push
   `git push -u origin <branch>`, and open/update a **draft** PR. Reference the
   issue (`Closes #N`).
7. **Babysit** — optionally subscribe to PR activity and drive CI to green /
   address review comments until the PR is merged or closed.

When there are **no open issues or PRs**, the backlog is empty and the loop has
nothing to process — that is a valid terminal state, not a failure. The
orchestrator should report the empty backlog rather than invent work.

## Adding or changing an agent

Each agent is a Markdown file with YAML frontmatter:

```markdown
---
name: kebab-case-name           # how the orchestrator invokes it
description: when to use it      # drives routing; be specific
tools: Read, Write, Edit, Grep, Glob, Bash   # least privilege
model: opus | sonnet | haiku    # match task complexity
---
System prompt: scope, invariants, workflow, definition of done.
```

Keep scopes non-overlapping, encode the codebase invariants, and give every agent
a concrete "definition of done" so results are verifiable.

## Settings & recommended permissions

`.claude/settings.json` ships only **safety guardrails** (a `deny` list blocking
force-push, `git reset --hard`, `git clean -fd`, and `rm -rf`) so the autonomous
team can't do something destructive. It intentionally does **not** grant any
extra `allow` permissions — widening the agent's own access should be a
deliberate, human decision.

To cut down on permission prompts during orchestration, opt into the allowlist
below yourself via `/permissions`, or add it to a personal (gitignored)
`.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
      "Bash(git show:*)", "Bash(git branch:*)", "Bash(git fetch:*)",
      "Bash(git add:*)", "Bash(git commit:*)", "Bash(git push:*)",
      "Bash(npm install)", "Bash(npm run lint)", "Bash(npm run lint:check)",
      "Bash(npm run typecheck)", "Bash(npm test)", "Bash(npm run test-window)",
      "Bash(npm run test:e2e)", "Bash(npm run build)",
      "mcp__github__list_issues", "mcp__github__list_pull_requests",
      "mcp__github__search_issues", "mcp__github__search_pull_requests",
      "mcp__github__issue_read", "mcp__github__pull_request_read",
      "mcp__github__get_file_contents", "mcp__github__list_commits",
      "mcp__github__list_branches", "mcp__github__actions_list",
      "mcp__github__actions_get", "mcp__github__get_job_logs"
    ]
  }
}
```

The existing `.claude/settings.public.json` PostToolUse hook (runs `npm run lint`
after edits) is left untouched; note it errors until `npm install` has populated
`node_modules`.
