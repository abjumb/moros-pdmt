# Infrastructure Independence — Roadmap

Moros is a fork of Mailspring, and today it still leans on Mailspring's hosted
infrastructure in four distinct ways. This roadmap enumerates every dependency (with
file references), groups them into phases ordered by risk and effort, and defines what
"fully independent" means for each feature.

The good news up front: **core email already works without Mailspring's servers.**
Account setup (IMAP/SMTP and OAuth token exchange) talks directly to Google/Microsoft
and the user's mail servers, and the sync engine runs fine with `IDENTITY_SERVER`
unset. The dependencies are concentrated in (1) how we *obtain* the sync-engine binary,
(2) the identity/cloud API that powers "pro" features, (3) shared OAuth app
registrations, and (4) distribution/telemetry plumbing.

## Dependency inventory

### A. Sync-engine binary sourcing (highest availability risk)

The C++ sync engine (Mailspring-Sync, GPLv3) is not vendored — it is a git submodule
pointing at `Foundry376/Mailspring-Sync` (`.gitmodules`), pinned but **not checked
out**. On `npm install`, `scripts/postinstall.js` downloads a prebuilt binary from
Mailspring's S3 bucket:

- `scripts/postinstall.js:47-71` — builds
  `https://mailspring-builds.s3.amazonaws.com/mailsync/<submodule-hash>/<platform>/mailsync.tar.gz`.
- `scripts/postinstall.js:78-93` — renames the binary to `mailspring-sync` because the
  prebuilt binary contains an anti-fork guard: `main()` exits with code 2 unless the
  executable path contains the substring `"mailspring"` (documented at
  `app/src/mailsync-process.ts:113-119`).
- `app/build/build.js:231-234` — the binary ships in `app.asar.unpacked`.

**If Foundry376 removes that bucket or object, every fresh install and CI build
breaks.** This is the single most fragile dependency.

### B. Identity + cloud API (`id.getmailspring.com`)

All "pro" features funnel through one HTTP client and one store:

- `app/src/flux/moros-api-request.ts:42-48` — `rootURLForServer('identity')` →
  `https://id.getmailspring.com` (prod). Every `makeRequest` call requires a
  Mailspring identity (throws otherwise, line 108).
- `app/src/flux/stores/identity-store.ts` — polls `GET /api/me` every 10 min; plan
  gating via `stripePlanEffective`; SSO into the hosted billing site via
  `POST /api/login-link`.
- `app/internal_packages/onboarding/lib/page-authenticate.tsx:11-27` — login and
  registration are **a hosted web page** (`{identityRoot}/onboarding`) rendered in a
  webview and scraped for the resulting identity JSON.
- `app/src/mailsync-process.ts:177-179` — the identity URL and identity JSON are also
  handed to the C++ engine, which syncs plugin metadata against Mailspring's cloud.

Features that round-trip through this infrastructure:

| Feature | Package / file | Server dependency |
| --- | --- | --- |
| Feature quotas / upsell | `flux/stores/feature-usage-store.tsx`, `send-feature-usage-event-task.ts` | quotas from `/api/me`; usage events POSTed by the engine |
| Send later, snooze, send reminders | `send-later`, `thread-snooze`, `send-reminders` packages | cloud metadata service fires `metadata-expiration` (works while app is closed; engine-side) |
| Link tracking | `link-tracking` (serverUrl in `package.json`) | `link.getmailspring.com` redirect + click counter |
| Open tracking (read receipts) | `open-tracking` | `link.getmailspring.com/o/…` pixel logger |
| Thread sharing | `thread-sharing/lib/main.tsx` | `/api/save-public-asset` + `shared.getmailspring.com` viewer |
| Translation | `translation/lib/service.ts:239` | `POST /api/translate` |
| Contact/company profiles | `participant-profile/lib/participant-profile-data-source.ts:34` | `GET /api/info-for-email-v2/{email}` |
| Grammar check | `composer-grammar-check` | LanguageTool deployment on the identity host |
| Activity report sharing | `activity/lib/dashboard/share-button.tsx:70` | `/api/share-static-page` |

The metadata-expiration mechanism is the hardest piece: the *timer authority* lives in
Mailspring's cloud and the sync logic lives in the C++ engine, not this repo.

### C. OAuth app registrations

- `app/internal_packages/onboarding/lib/onboarding-constants.ts:5-39` — Gmail client
  ID/secret and Office 365 client ID are **Mailspring's** app registrations (the Gmail
  secret is decrypted at runtime; the comment acknowledges forks reuse it "on the honor
  code"). Both are overridable via `MS_GMAIL_CLIENT_ID`/`MS_GMAIL_CLIENT_SECRET` and
  `MS_O365_CLIENT_ID` env vars at build time.
- Token exchange itself goes directly to Google/Microsoft (no Mailspring proxy), and
  the OAuth redirect lands on a local loopback server (port 12141). One cosmetic
  residual: `oauth-signin-page.tsx:82` redirects the browser to
  `https://id.getmailspring.com/oauth/finished` after capturing the code.

**Risk:** Mailspring could rotate the secret or Google/Microsoft could revoke the
shared app at any time, breaking Gmail/O365 sign-in for Moros users.

### D. Distribution, updates, telemetry, branding

- **Sentry (live egress today):**
  `app/src/error-logger-extensions/sentry-error-reporter.js:7` ships an active DSN for
  org `o70907` (presumably Mailspring's) and sends every non-dev error, tagged with a
  SHA-256 hash of the machine MAC address, with no user opt-out. Source maps are also
  uploaded to that org in CI (`app/build/build.js:148-195`).
- **Auto-update (disabled but wired):** `app/src/browser/autoupdate-manager.ts:62-78`
  hardcodes `updates.getmailspring.com` feeds; an early `return` currently disables the
  updater. `autoupdate-impl-base.ts:6` falls back to `getmailspring.com/download`.
- **CI publishing:** `.github/workflows/build-*.yaml` sync artifacts to
  `s3://mailspring-builds/` using Mailspring's AWS credentials; snap publishing needs
  our own Snapcraft credentials (snap name `moros` is already ours in
  `snap/snapcraft.yaml`).
- **Native crash reporter:** points at `id.getmailspring.com/report-crash` but has
  `uploadToServer: false` (`app/src/error-logger.js:139-152`) — inert.
- **Branding/links long tail:** every new draft gets a
  `Message-ID: <uuid>@getmailspring.com` header (`flux/stores/draft-factory.ts:65`);
  signature social icons and the company-logo service load from `getmailspring.com`
  (`composer-signature/lib/{templates.tsx,constants.ts:128}`); dozens of help/support/
  upsell links point at `community/support/getmailspring.com` and
  `Foundry376/Mailspring*` GitHub repos; `support@getmailspring.com` appears in 60+
  `app/lang/*.json` strings; Linux appdata/rpm-spec/deb-maintainer metadata reference
  `getmailspring.com`; link-unwrapping regex hardcodes `link.getmailspring.com`
  (`app/src/regexp-utils.ts:225-231`).

---

## Phases

Ordering principle: kill unintended egress first, then remove the single points of
failure (binary hosting, OAuth apps), then make a deliberate product decision about
each cloud feature, and only then consider replacing the engine itself.

### Phase 1 — Stop unintended egress and stale pointers (days)

Small, independent, zero-product-decision changes:

- [ ] Remove or replace the Sentry DSN (`sentry-error-reporter.js:7`); if kept, use our
      own org, gate it behind an explicit opt-in config key, and drop the MAC-derived
      device hash. Remove the Sentry source-map upload from CI or repoint it.
- [ ] Change the draft `Message-ID` domain (`draft-factory.ts:65`) to a Moros domain.
- [ ] Replace the post-OAuth `id.getmailspring.com/oauth/finished` redirect
      (`oauth-signin-page.tsx:82`) with an inline "you can close this tab" response.
- [ ] Remove the inert crash-reporter `submitURL` (`error-logger.js:139-152`).
- [ ] Fix the update-notification changelog link
      (`notifications/lib/items/update-notification.tsx:51`) to point at our releases.

### Phase 2 — Own the sync-engine binary (weeks)

Removes the most fragile dependency. The engine is GPLv3, so forking and self-hosting
is legally clean.

- [ ] Fork `Foundry376/Mailspring-Sync` into our org; repoint the `.gitmodules` URL and
      pin our fork's commit.
- [ ] Stand up a CI pipeline in the fork that builds the engine for
      mac-arm64/mac-x64/linux-x64/linux-arm64/win-ia32 (Mailcore2 toolchain) and
      publishes `mailsync.tar.gz` per commit hash — GitHub Releases is sufficient; no
      S3 required.
- [ ] Remove the `"mailspring"` executable-path guard in the fork so the binary can be
      named `moros-sync`; update `postinstall.js:78-93` and
      `mailsync-process.ts:113-119` accordingly.
- [ ] Repoint `scripts/postinstall.js:47-71` at our artifact host, keeping the
      build-from-source path (`mailsync/build.sh`) working as the fallback.
- [ ] Document the source build in `docs/` so the project survives even with no hosted
      binaries.

### Phase 3 — Own the OAuth app registrations (weeks; long external lead time — start early)

- [ ] Register our own Google Cloud OAuth client. The `https://mail.google.com/` scope
      is *restricted*: budget for Google's app verification plus an annual CASA
      security assessment. This is the longest external dependency in the roadmap —
      kick it off in parallel with Phase 2.
- [ ] Register our own Azure AD application for O365/Outlook (public client + PKCE, as
      today).
- [ ] Wire the new IDs through `MS_GMAIL_CLIENT_ID`/`MS_GMAIL_CLIENT_SECRET`/
      `MS_O365_CLIENT_ID` in CI, and replace the embedded Mailspring secret in
      `onboarding-constants.ts` with our own (or move the secret out of the client
      entirely if we later stand up a token-exchange proxy).
- [ ] Until verification lands, IMAP-with-app-password remains the documented fallback
      for Gmail.

### Phase 4 — Own distribution and updates (weeks, parallel with 2–3)

- [ ] Switch `.github/workflows/build-*.yaml` from `s3://mailspring-builds` to our own
      bucket **or** drop S3 entirely and publish through the existing
      GitHub-Releases-based `release.yaml` path.
- [ ] Publish the `moros` snap under our own Snapcraft credentials.
- [ ] Re-enable auto-update against our own feed: either a small feed service
      preserving the current `check/{platform}/{arch}/{version}` shape
      (`autoupdate-manager.ts:62-67`), or migrate to `electron-updater` with the
      GitHub-Releases provider (the release pipeline already produces Squirrel
      artifacts). Replace `FALLBACK_DOWNLOAD_URL` (`autoupdate-impl-base.ts:6`) and
      update `app/spec/autoupdate-manager-spec.ts`.
- [ ] Fix distro metadata: appdata XML, rpm spec URL, deb maintainer address.

### Phase 5 — Decouple identity and cloud features (the big product decision)

Every feature in table B needs one of three dispositions: **(a) make it local**,
**(b) self-host a replacement service**, or **(c) drop it**. The client plumbing is
mercifully centralized — `rootURLForServer()` is one function, and all quota gating
lives in `FeatureUsageStore`.

Recommended dispositions:

- [ ] **Kill the identity requirement.** Make `IdentityStore` synthesize a local
      always-Pro identity (or make `makeRequest` callers degrade gracefully), make
      `FeatureUsageStore.isUsable()` always true, and remove the hosted
      `/onboarding` webview, billing SSO, upsell modals, and `$8/month` copy
      (`preferences-identity.tsx`, `feature-used-up-modal.tsx`,
      `open-identity-page-button.tsx`). Stop passing `IDENTITY_SERVER` to the engine.
- [ ] **Make scheduling local:** snooze, send later, and send reminders currently rely
      on Mailspring's cloud to fire `metadata-expiration` (so they work while the app
      is closed). Replace with a client-side scheduler that scans metadata expirations
      on launch and on a timer, and emits the same events the packages already listen
      for. Accept the trade-off (actions fire only while the app runs — on next launch
      otherwise) and document it. Cross-device metadata sync goes away with the cloud;
      metadata stays in the local database.
- [ ] **Drop (default) or self-host (optional):** link tracking, open tracking, thread
      sharing, contact/company profile enrichment, activity-report sharing. These
      require public web infrastructure by nature. Default: remove the packages from
      the build (they are self-contained internal packages). Optional later: a small
      self-hosted service speaking the same URL shapes (`/link/{id}/{i}?redirect=`,
      `/o/{token}.png`, asset upload + static viewer).
- [ ] **Translation & grammar check:** point `/api/translate` at a self-hosted
      LibreTranslate (or a user-configurable endpoint), and grammar check at a
      self-hosted LanguageTool — both are drop-in open-source servers — or disable the
      packages.
- [ ] Update `regexp-utils.ts:225-231` link-unwrapping for whatever tracking domain (if
      any) survives.

### Phase 6 — Branding and link sweep (days, any time after Phase 1)

- [ ] Repoint all `community/support/getmailspring.com`, `getmailspring.com/pro`, and
      `Foundry376/Mailspring*` links (application menu, onboarding, preferences,
      package-manager errors, key-manager errors, mailsync troubleshooting links) at
      our own docs/repo.
- [ ] Sweep `support@getmailspring.com` out of `app/lang/*.json`.
- [ ] Bundle the signature social-icon assets locally and drop or replace the
      `logo.getmailspring.com` company-logo lookup
      (`composer-signature/lib/constants.ts:128`).

### Phase 7 (optional, long-term) — Replace the C++ engine

Not required for independence once Phase 2 lands (we own a GPLv3 fork), but worth
tracking as the only path off the C++/Mailcore2 stack:

- The UI is already isolated behind `MailsyncProcess`/`MailsyncBridge` and a
  newline-delimited JSON protocol (`{type:'persist'|'unpersist', modelClass,
  modelJSONs}` deltas in; `queue-task`/`need-bodies`/`wake-workers` messages out).
- A protocol-compatible replacement (Node daemon on `imapflow` + `nodemailer`, or a
  JMAP client for providers that support it) could be swapped in without touching the
  React/flux layer — but it must reimplement folder sync, threading, the SQLite
  writer, and the whole task lifecycle. Treat as its own project with its own roadmap;
  a milestone-zero spike is to formalize the protocol as a spec document and build a
  conformance harness against the existing engine.

## Definition of done

Moros is infrastructure-independent when:

1. `npm install` and CI builds succeed with `mailspring-builds.s3.amazonaws.com`
   unreachable.
2. The app makes **zero** network requests to `*.getmailspring.com`, Mailspring's
   Sentry org, or Mailspring's S3 in normal operation (verifiable by running with a
   proxy/`mitmproxy` and a DNS blocklist).
3. Gmail/O365 sign-in uses our own OAuth registrations.
4. Snooze/send-later/reminders work (with the documented app-must-run caveat) with no
   identity configured.
5. Auto-update, crash/error reporting (if any), and package publishing run entirely on
   infrastructure we control.

## Effort/risk summary

| Phase | Effort | External lead time | Risk removed |
| --- | --- | --- | --- |
| 1 — Egress/pointers | days | none | silent telemetry to third parties |
| 2 — Sync binary | weeks | none | install/CI hard-breakage if S3 disappears |
| 3 — OAuth apps | weeks | **months** (Google CASA) | Gmail/O365 sign-in revocation |
| 4 — Distribution | weeks | signing/store accounts | can't ship or update builds |
| 5 — Identity/cloud | weeks–months | none | pro features degrade or break silently |
| 6 — Branding sweep | days | none | user-facing dead links, domain leakage |
| 7 — Engine replacement | quarters | none | C++/Mailcore2 maintenance burden (optional) |
