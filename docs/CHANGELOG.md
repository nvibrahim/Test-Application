# Changelog

Each phase ends with an entry here. Dates are the day the phase was finished.

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
