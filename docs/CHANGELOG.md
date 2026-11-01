# Changelog

Each phase ends with an entry here. Dates are the day the phase was finished.

## Phase 5, Theme, landing and mobile (1 November 2026)

- **Theme engine** in the shared package: one brand colour and the Appearance choices produce
  every token for light and dark; every text/background pair the engine owns is checked at
  WCAG 2.2 AA (4.5:1 text, 3:1 outlines) by unit tests over all six presets, every sidebar and
  top-bar style, and sixteen custom colours. A colour white text cannot read on is darkened
  until it can (the hue stays) and the API says so. Status and chart colours never change.
- **Appearance endpoint** (public, ETag, a minute's cache) with the computed tokens; the root
  layout injects them as a nonce-carrying `<style>` before first paint; the sign-in page and
  the landing page are branded before anyone signs in. Sidebar and top bar follow the chosen
  styles; density and corners are attributes on `<html>`.
- **Brand pictures**: logo for light and dark, browser-tab icon, sign-in picture. PNG, JPG or
  WebP up to 1 MB, the type and size read from the bytes, SVG refused, the icon squared in the
  browser before upload; served back only as the picture type they are.
- **Landing page** with wording from Settings -> General, **privacy** draft, **contact form**
  (rate limited per address, a honeypot, a minimum fill time, emails the support address,
  stores an audit row only).
- **Enforced CSP** with a per-request nonce from the proxy, `frame-ancestors 'none'`, no
  inline scripts. **PWA**: a manifest from Settings with the brand icon, installable, the
  shell's own icon as fallback.
- **Design-system page** (`/design-system`) with every component in every state.
- **Tests:** 30 shared (theme engine), 33 API unit, 75 API integration (appearance, ETag,
  darkened colour, picture upload and refusals, contact form on/off, honeypot, limit),
  Playwright: public pages with axe at three widths, CSP and manifest present, a brand colour
  recolouring the app.
- **Not in this phase:** a Lighthouse run (no Chrome DevTools in the build container; the pages
  are static server components with the smallest JavaScript the shell allows).

## Phase 4, Organization and settings (1 November 2026)

- **Settings** (`/admin/settings`): eight sections, each with its own Zod schema in the shared
  package, saved independently as key/value rows with defaults, versioned, cached a minute and
  dropped on write; secrets (the SMTP password) sealed with AES-256-GCM and reported as set or
  not set, never returned; permission and step-up per section (Security needs the reserved
  permission; Security, Email, Backups and Maintenance ask for step-up); before-and-after audit
  without secrets; a schema-driven form on the web with provider presets and **Send test email**.
- **Public settings** endpoint: name, tagline, landing wording, appearance and maintenance state
  for every page before sign-in; the product name now comes from Settings -> General everywhere.
- **Organization profile** with preview-then-edit; legal name, country and currency ask for
  step-up; a version check on every save. **Locations**: add and edit, never delete; the head
  office cannot be made inactive; optional manager.
- **Notifications**: a type registry with defaults, per-user preferences on the profile, the
  list page with unread filter and mark read, the bell in the top bar, administrator
  notifications (lockout, security settings changed, maintenance) with email per Settings ->
  Notifications plus extra addresses.
- **Maintenance mode**: closes the app to everyone except the chosen roles with a message;
  sign-out and the session still answer; the web shows the message instead of the app.
- **Realtime**: a Socket.IO gateway on the API fed by the outbox through Redis, rooms per
  user, session, organization and admin, session-cookie authentication from our origin only;
  the web app refreshes open screens on any event for the person, and a session revoked
  elsewhere is disconnected at once.
- **Mail settings** resolved from Settings -> Email with the environment as fallback, by the
  API (test send, health) and the worker (every queued email).
- **Tests:** 31 API unit, 71 API integration (sections, secrets, step-up, maintenance for a
  Member and the Super Admin, profile and locations rules, notifications and preferences,
  administrator emails), 26 shared; Playwright: settings save, provider preset, organization
  edit after preview, adding a location, the notifications page.

## Phase 3, Access (1 November 2026)

- **Permission registry:** 24 `resource.action` keys across users, roles, organization,
  settings, audit, backups, notifications and system, synced to the database at start; four are
  reserved to the Super Admin (`roles.manage`, `settings.security.manage`, `backups.restore`,
  `users.superadmin.manage`) and refused on any other role.
- **Roles:** the fixed Super Admin (shown as "All", not editable) plus Administrator, Member and
  Viewer with editable defaults, a "Customised" mark and reset to default; custom roles created
  (optionally copying another role), edited and deleted; every change needs `roles.manage` and
  step-up and carries a version check. The matrix screen (`/admin/roles`): roles as columns,
  permissions grouped by module as rows, one role at a time on phones.
- **Users administration** (`/admin/users`, `/admin/users/[id]`): invite with several role
  assignments, each for every location or one of them, and restricted locations; 72-hour
  single-use links (a new link cancels the old; the link is also shown to the inviter); the
  accept page with the password policy; detail with access editor, Super Admin promote and
  demote (reserved + step-up, the last active Super Admin protected), send a new link, disable
  (signs out everywhere, emails), enable, reset 2FA, anonymise (GDPR), recent activity; list
  filters by status and two-step, search.
- **Self-service email change** by a confirmation link to the new address (Profile -> Personal).
- **Scoping in one place:** `visibleLocationIds` from restricted locations and scoped assignments;
  the session carries the inputs; `/locations` lists what a person may see.
- **Feature-switch guard:** `@RequireFeature()` answers "not found" while a switch is off
  (off / on / super_admin_only / selected_users); the screen arrives in Phase 7.
- **Retention:** expired, un-accepted invitations remove the invited user so the email can be reused.
- **Tests:** 31 API unit, 61 API integration (matrix refusals, reserved keys, versions, invite
  through accept, deny by default for a teammate, live role change, disable and enable, last
  Super Admin, promote and demote, email change, anonymise), Playwright: invitation through the
  teammate's first sign-in and the matrix edit with step-up.
- **Not in this phase (by plan):** adding and editing locations (Phase 4), the Settings screens
  (Phase 4), the feature switches screen (Phase 7).

## Phase 2, Two-factor (1 November 2026)

- **TOTP** (30 s, ±1 step) with replay protection by the last used step; the secret is sealed
  with AES-256-GCM and its key fingerprint; the issuer is the organization's name; a QR code and a
  copyable key for same-device set-up; the first code confirms the app before anything is saved.
- **Recovery codes:** ten, HMAC-hashed, single use, shown once with copy and download, regenerable
  behind step-up; using one writes a notification and sends an email.
- **Trusted devices:** a hashed cookie for the Settings -> Security number of days (default 30),
  skips the verify stage at sign-in; listed and removable from Profile -> Security.
- **The verify stage:** the screen after sign-in with the code box (one-time-code autofill), a
  recovery-code mode and the trust-this-device tick; five wrong codes end the session.
- **Step-up:** password or code within the last ten minutes, grants in `step_up_grants`,
  enforced by `@RequireStepUp()`; the web app asks in a dialog and repeats the action.
- **Reminder, not enforcement (owner's decision):** a banner in the shell until two-step is set
  up, dismissable for the interval in Settings (default 7 days); reminder emails on day 1, 7
  and 30, once each, from the scheduled job `two-factor-reminder`; a Set up now card on the
  dashboard.
- **Users list** (`/admin/users`, `users.read`): a two-step column and filter, search; Reset
  2FA (`users.manage` + step-up, signs the person out everywhere, emails them) and Send reminder.
- **A first scheduler in the worker:** one BullMQ job scheduler per entry of the shared registry
  on the `maintenance` queue (outbox cleanup, retention cleanup, two-factor reminders), each run
  recorded on its `scheduled_jobs` row. Pause, resume, run now and the screen come in Phase 7.
- **New-device email** at sign-in from a device not seen before.
- **Components:** Dialog in `packages/ui` (a sheet on phones, a dialog elsewhere).
- **Migration** `202611021000_two_factor_reminders` (two columns on `user_preferences`).
- **Tests:** 27 API unit, 43 API integration (set-up, wrong and replayed codes, trusted device,
  recovery code once, five failures, step-up, admin reset, reminders), 19 shared; Playwright at
  three widths: the whole journey from the reminder banner to turning it off with step-up, and
  the Users list.
- **Not in this phase (by plan):** enforcing policies (`required_admins`, `required_all`) are
  stored and reserved but not applied, per the owner's decision; WebAuthn is designed for
  (`user_two_factor.kind`) and not built.

## Phase 1, Identity (1 November 2026)

- **Shared:** password policy on zxcvbn (minimum 8, 12 for a Super Admin, strength score 3,
  no personal words, 128 maximum) with one implementation for browser and API; Settings ->
  Security schema and defaults; auth contracts; seven new error codes.
- **API, auth module:** Argon2id with rehash; breached-password check (HIBP k-anonymity,
  skipped silently offline); password history; brute-force protection with Redis counters that
  fail closed and a database lock that is authoritative (growing delay after 5, lock after 10
  with an email); opaque sessions (hashed token, HttpOnly cookie, idle and absolute expiry,
  remember-me, 60-second Redis cache, instant revocation); double-submit CSRF with an Origin
  check; the global access guard enforcing rules, stages, the setup lock and permissions;
  sign-in, sign-out, session info and extend, forced and voluntary password change, forgot and
  reset (single-use 30-minute links, every session revoked), first-run setup of the organization
  and head office, the profile with preferences and the sessions list. Email through the
  `email` queue with an `email_log` row per message; the worker sends it.
- **CLI:** `inspower admin create` and `inspower admin recover` (password from a hidden
  prompt or `INSPOWER_ADMIN_PASSWORD`).
- **Web:** sign-in, forgot and reset password, forced change-password, setup wizard (country
  fills currency and time zone), session-ended and two-factor placeholder; the app shell with a
  generated sidebar (desktop) and bottom bar (phone), top bar with sign-out, idle-timeout banner
  with "Stay signed in"; dashboard; profile with Personal, Security (change password, sessions
  with revoke and "sign out everywhere else") and Preferences (theme applied server-side).
  Form components in `packages/ui`: Input, Label, Select, Checkbox, Alert, Field, Skeleton.
- **Tests:** 23 API unit tests, 28 API integration tests (every refusal and the whole first
  sign-in journey), shared and web unit tests, and Playwright with axe at phone, tablet and
  desktop widths (`pnpm test:e2e`: resets `inspower_e2e`, starts the production builds, runs
  the owner journey, dashboard, profile and sign-out; the emailed reset link runs where Mailpit
  is available).
- **Docs:** ADR-002, the lost-owner runbook, Phase 1 ticks in the behaviour checklist, screenshots
  under `docs/architecture/screens/`.
- **Not in this phase (by plan):** two-factor (Phase 2), invitations and other users (Phase 3),
  Settings screens (Phase 4), the realtime gateway that closes a revoked session instantly in
  the browser (the revoked session already fails on its next request).

## Phase 0, Foundation (1 November 2026)

- Brand-new repository scaffold: pnpm workspaces + turbo (`envMode: strict`), Node 24, TypeScript 6
  strict, packages named `@inspower/*`.
- `packages/shared`: product name constants, error contract and codes, health schemas, audit and
  outbox naming rules, permission registry skeleton with a renames list.
- `packages/ui`: design tokens for light and dark, `cn` helper, Button, Card and Badge.
- `apps/api`: NestJS 12 on Express 5. Validated configuration (refuses placeholder keys outside
  local dev), structured logging with request ids, the error filter, Zod pipe, AES-256-GCM crypto
  helper with key fingerprints, Prisma 7 with the pg driver adapter, Redis, mail, local-disk
  storage adapter, the transaction helper with `audit()` and `emit()`, health (`/api/v1/health`
  and `/health/details`), access-rule decorators and the boot-time unguarded-route check.
- Database: 35 tables in one `.prisma` file per module, first migration
  `202611011730_core_init` with the append-only trigger on `audit_logs`; seed for 249 countries
  and 162 currencies from the runtime's Unicode data.
- Worker: heartbeat, outbox publisher, the four queues (`email`, `maintenance`, `backup`,
  `exports`) with placeholder processors.
- CLI: `inspower keys generate`, `db check`, `version`.
- `apps/web`: Next.js 16 App Router with the four route groups, root layout with tokens, typed
  API client, route metadata schema, public layout, start page and the system health page.
- Infra: Docker Compose for development (Postgres 17, Valkey, Mailpit, optional MinIO) and for one
  production stack per organization; multi-stage Dockerfile with `web`, `api`, `worker`,
  `migrate` and `cli` roles; Caddyfiles.
- CI: lint, typecheck, unit tests, integration tests against service containers, browser tests
  (once there are any), image build with a role smoke test.
- Docs: README, ADR-001, the behaviour checklist, this changelog.
- Tests: 26 unit tests across shared, ui, api and web; 8 API integration tests (health, error
  contract, request ids, the transaction helper's commit and rollback, the audit trigger).
