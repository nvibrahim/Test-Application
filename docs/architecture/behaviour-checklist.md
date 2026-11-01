# Behaviour checklist

The reference application is used for **behaviour only**; no code is copied. Each line below is a
behaviour a later phase must prove with a test. Tick the box with the test's name when it exists.
Phase 0 items are already covered.

## Phase 0, Foundation

- [x] The API refuses to start if any route lacks an access rule — `route-check.ts`, exercised by `createTestApp`
- [x] Production refuses placeholder encryption keys; local dev substitutes a fixed key with a warning — `config.spec.ts`
- [x] Every response carries `x-request-id`; a well-formed incoming id is echoed — `health.e2e-spec.ts`
- [x] Errors leave as `{ code, message, details?, requestId }` with stable codes — `health.e2e-spec.ts`
- [x] `/api/v1/health` answers 200 only when database and cache answer; `/details` names worker and mail — `health.e2e-spec.ts`
- [x] A change, its audit row and its outbox event commit together, or not at all — `transaction.e2e-spec.ts`
- [x] Audit rows can never be updated or deleted — `transaction.e2e-spec.ts` (database trigger)
- [x] Audit actions and event names must be `module.entity.action` — `audit.test.ts`
- [x] AES-256-GCM sealing round-trips, detects a wrong key by fingerprint and refuses tampering — `crypto.spec.ts`
- [x] Storage keys cannot escape the storage root — `storage.spec.ts`

## Phase 1, Identity

- [x] Sign-in with an unknown email takes the same time as with a known one (dummy Argon2 verify) — `auth.e2e-spec.ts` (answers unknown emails and wrong passwords the same way); `passwords.service.ts` verifyDummy
- [x] Wrong password: progressive delay after 5 attempts, lockout for 15 minutes after 10 with an email; the database lock is authoritative — `throttle.spec.ts` (delays), `auth.e2e-spec.ts` (lockout)
- [x] Per-IP block and per-email limits; **fail closed** when Redis is unavailable ("temporarily unavailable") — `throttle.spec.ts` (fails closed), `auth.e2e-spec.ts` (reset limit)
- [x] Session token is opaque, 32 bytes, stored only as SHA-256; cookie is `__Host-inspower_session`, HttpOnly, Secure (outside dev), SameSite=Lax — `sessions.service.ts`, `auth.e2e-spec.ts` (HttpOnly cookie)
- [x] Idle timeout 30 minutes with a warning 2 minutes before and `POST /auth/session/extend`; absolute timeout 12 hours; both from Settings → Security — `auth.e2e-spec.ts` (extends the idle timer), `security.ts` defaults, `idle-banner.tsx`
- [x] Session stage machine: `verify_two_factor` (only when 2FA is set up) → `change_password` → `active`; guards accept a list of stages — `credentials.spec.ts`, `auth.e2e-spec.ts` (wrong_stage)
- [x] CSRF: double-submit token plus Origin check on every state-changing request, applied globally — `auth.e2e-spec.ts` (no header; other origin)
- [x] Password policy (shared code, same in browser and API): minimum 8 (Super Admin 12), maximum 128, zxcvbn ≥ 3, no email/name/organization/app name, breached-password check skipped silently offline, history of 5, optional expiry, forced change flag — `password-policy.test.ts`, `auth.e2e-spec.ts` (weak, reused)
- [x] Argon2id 64 MiB t=3 with rehash on sign-in when parameters change — `passwords.service.ts` ARGON2_OPTIONS, `credentials.service.ts` needsRehash
- [x] Password reset link lasts 30 minutes, works once, revokes every session on use — `auth.e2e-spec.ts` (forgot and reset password)
- [x] "Sign out other sessions" revokes them at once; revoked sessions fail on the next request — `auth.e2e-spec.ts` (lists sessions, signs the others out)
- [x] First-run setup wizard: password, (optional) 2FA, organization, head office, preferences; the app stays locked until organization and head office exist — `auth.e2e-spec.ts` (setup_required; completes the organization), `e2e/auth.spec.ts`
- [x] `inspower admin create` refuses when a Super Admin exists; `admin recover` resets 2FA and sets a temporary password; the owner types the password, never the assistant — `auth.e2e-spec.ts` (the command line), `cli/admin.ts`
- [x] Every sign-in step is in the audit log with the visitor's address (through `TRUST_PROXY`) — `auth.e2e-spec.ts` (login_attempts reasons; audit actions)

## Phase 2, Two-factor

- [x] TOTP 30 s ±1 step, replay-protected by last used step; secret sealed with AES-256-GCM; issuer is the organization name — `totp.spec.ts`, `two-factor.e2e-spec.ts` (replayed code, issuer)
- [x] 10 recovery codes, HMAC-hashed, single use, regenerable; use is audited and notified — `two-factor.e2e-spec.ts` (recovery code once; notification and email)
- [x] Trusted devices: hashed cookie token, 0–90 days from Settings → Security — `two-factor.e2e-spec.ts` (trusts the device; skips the verify stage)
- [x] Reminder, not enforcement: dismissible banner returns after 7 days (1–90), reminder emails at day 1, 7 and 30 sent once each, a 2FA column and filter on Users — `two-factor.e2e-spec.ts` (reminder shows, dismissed; Users list filter), `two-factor-reminder.ts`, browser `two-factor.spec.ts`
- [x] Admin reset of a user's 2FA needs step-up, is audited and emails the user — `two-factor.e2e-spec.ts` (resets two-step verification for a person)
- [x] Step-up: password or TOTP within the last 10 minutes, grants in `step_up_grants`, 5 wrong tries end the session — `two-factor.e2e-spec.ts` (step-up and the sensitive actions), `step-up.service.ts`
- [x] Wrong TOTP codes: the sign-in attempt ends after 5 — `two-factor.e2e-spec.ts` (ends the session after five wrong codes)

## Phase 3, Access

- [x] Permission registry synced to the database at start; renames applied once from a single list — `access-sync.ts`, `access.e2e-spec.ts` (lists the registry)
- [x] Fixed Super Admin: every permission now and in future, not editable, bypasses location scoping and feature switches but not 2FA, step-up or audit; the last active one cannot be disabled or anonymised — `access.e2e-spec.ts` (refuses to edit the Super Admin role; last Super Admin)
- [x] Reserved permissions can never be granted to another role: `roles.manage`, `settings.security.manage`, `backups.restore`, `users.superadmin.manage` — `permissions.test.ts`, `access.e2e-spec.ts` (reserved_permission)
- [x] Multiple roles per user, union of permissions; optional location scope per assignment, enforced by one `ScopedRepository` helper — `scoped.spec.ts`, `access.e2e-spec.ts` (two scoped roles; union)
- [x] Deny by default: a Viewer reaches no admin screen or endpoint (verified by test) — `access.e2e-spec.ts` (deny by default for a teammate), browser `access.spec.ts`
- [x] Invitation: single-use hashed token, 72 hours; the `invited` user row is removed when it expires so the email can be reused; a new link cancels the old — `access.e2e-spec.ts` (a new link cancels the old; accepts once), `retention-cleanup.ts`
- [x] Deactivate signs the person out everywhere at once; history is kept; anonymise replaces name and email and revokes sessions — `access.e2e-spec.ts` (disable; anonymise)
- [x] Route metadata drives both the server-component guard and the generated navigation; no hand-written nav list — `routes.ts`, `routes.test.ts`, browser `access.spec.ts` (Roles absent from a Member's menu)
- [x] Permission matrix edits need step-up and are audited — `access.e2e-spec.ts` (step_up_required), browser `access.spec.ts`

## Phase 4, Organization and settings

- [x] One organization per database; `organization_id` on every table — `schema/*.prisma`, `organization.controller.ts`
- [x] Exactly one head office, which cannot be made inactive; locations are never deleted — `settings.e2e-spec.ts` (never deactivates the head office)
- [x] Settings sections save independently, are versioned, and secrets never come back to the browser ("set / not set") — `settings.e2e-spec.ts` (Email keeps the password sealed)
- [x] Changing legal name, tax number, country or currency asks for step-up; Security, Email and Maintenance sections ask for step-up — `settings.e2e-spec.ts` (legal name needs step-up; Security needs step-up)
- [x] Settings cache invalidates by outbox event; a cached value from an older shape is read again (version-keyed cache) — `settings-reader.ts` (version in the key, parse-or-defaults), `settings.service.ts` (invalidate on write)
- [x] Every save checks the record's `version`; a stale save says so instead of overwriting — `settings.e2e-spec.ts` (organization conflict), `access.e2e-spec.ts` (roles, users)
- [x] Email provider presets are data only; "Send test email" sends to the signed-in address without saving — `sections.ts` presets, `settings.e2e-spec.ts` (test email), browser `settings.spec.ts`
- [x] Notifications: per-type defaults, per-user overrides, bell with live updates — `settings.e2e-spec.ts` (notifications), `realtime.gateway.ts`, `bell.tsx`

## Phase 5, Theme, landing and mobile

- [x] One brand colour produces every token for light and dark; every text/background pair is WCAG 2.2 AA (unit tests over all presets and a spread of custom colours); a colour white text cannot be read on is refused — `engine.test.ts` (darkened instead of refused, see ADR-003), `appearance.e2e-spec.ts`
- [x] Status and chart colours never change with the brand — `engine.ts` (only brand, sidebar, top bar, link and ring tokens are written)
- [x] Tokens are injected before first paint with a nonce; nothing is emitted for the built-in look — `app/layout.tsx`, `appearance.e2e-spec.ts` (css empty for the built-in look)
- [x] Brand assets: PNG, JPG or WebP up to 1 MB, type and size read from the bytes, SVG refused, served back only as a picture — `image-check.spec.ts`, `appearance.e2e-spec.ts`
- [x] Enforced CSP with nonces; no inline scripts; `frame-ancestors 'none'` — `proxy.ts`, browser `appearance.spec.ts`
- [x] Landing wording comes from Settings; contact form is rate limited, has a honeypot, stores nothing but an audit row — `appearance.e2e-spec.ts` (the public contact form)
- [x] Core flows pass at 375, 820 and 1440 px with axe; touch targets ≥ 44 px on phones; PWA installs — every browser spec runs at the three widths with axe; `manifest.webmanifest/route.ts`

## Phase 6, Backup and restore

- [x] `pg_dump -F c` plus a manifest (version, migration id, timestamp, checksum, key fingerprint), AES-256-GCM streamed with a fresh nonce per file — `backup-file.spec.ts`, `backups.e2e-spec.ts`
- [x] A rotated key is detected from the fingerprint before a restore fails — `backup-file.spec.ts` (WrongBackupKeyError)
- [x] Targets behind one adapter (`local` always; `s3` optional); retention 14 daily / 8 weekly / 12 monthly per target — `retention.spec.ts`, `backups.e2e-spec.ts` (retention, targets)
- [x] Nightly job at 02:00 organization time; "Back up now" needs step-up and is audited; pre-release backup from the release command (`backup run --kind pre_release`; the release command arrives in Phase 7) — `tasks.spec.ts`, `backups.spec.ts`
- [x] Restore from the CLI stops the app, restores into a fresh database, migrates forward if older, swaps and health-checks; in-app restore only schedules with a typed confirmation — rehearsal in the runbook, `backups.e2e-spec.ts` (restore 403/400/202), `backups.spec.ts`
- [x] Weekly restore drill restores the latest backup into a scratch database, checks row counts, records `restore_tested_at`, notifies on failure — `backups.e2e-spec.ts` (drill), `backups.spec.ts` (Verify)
- [x] A missed backup raises an admin notification — `checkMissed` in the retention job; health `backup` check degraded

## Phase 7, Operations

- [ ] Scheduled jobs: declared in code, never run twice at once, "catch up" runs once after the worker was off, pause/resume/run now audited and live
- [ ] Background jobs: live counts, history with retry/cancel/remove, each audited; Bull Board behind admin auth on the web app's origin
- [ ] Audit log screen filters by actor, action, entity and date; CSV export needs step-up and is itself audited
- [x] Health details: database, Redis, worker heartbeat, mail, disk, last backup — Phase 6, `backups.spec.ts` (dashboard)
- [ ] Release: version `YYYY.MM.DD-<sha>`, pre-release backup, migrate, restart, health check, automatic rollback; demo client first; migrations are add-only within one release

## Phase 8, Hardening

- [ ] Threat model reviewed; `pnpm audit` clean at high severity; accessibility audit passed; sign-in load test recorded
- [ ] Every 1.0 acceptance check in the plan's section 14 passes
