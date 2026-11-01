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

- [ ] Sign-in with an unknown email takes the same time as with a known one (dummy Argon2 verify)
- [ ] Wrong password: progressive delay after 5 attempts, lockout for 15 minutes after 10 with an email; the database lock is authoritative
- [ ] Per-IP block and per-email limits; **fail closed** when Redis is unavailable ("temporarily unavailable")
- [ ] Session token is opaque, 32 bytes, stored only as SHA-256; cookie is `__Host-inspower_session`, HttpOnly, Secure (outside dev), SameSite=Lax
- [ ] Idle timeout 30 minutes with a warning 2 minutes before and `POST /auth/session/extend`; absolute timeout 12 hours; both from Settings → Security
- [ ] Session stage machine: `verify_two_factor` (only when 2FA is set up) → `change_password` → `active`; guards accept a list of stages
- [ ] CSRF: double-submit token plus Origin check on every state-changing request, applied globally
- [ ] Password policy (shared code, same in browser and API): minimum 8 (Super Admin 12), maximum 128, zxcvbn ≥ 3, no email/name/organization/app name, breached-password check skipped silently offline, history of 5, optional expiry, forced change flag
- [ ] Argon2id 64 MiB t=3 with rehash on sign-in when parameters change
- [ ] Password reset link lasts 30 minutes, works once, revokes every session on use
- [ ] "Sign out other sessions" revokes them at once; revoked sessions fail on the next request
- [ ] First-run setup wizard: password, (optional) 2FA, organization, head office, preferences; the app stays locked until organization and head office exist
- [ ] `inspower admin create` refuses when a Super Admin exists; `admin recover` resets 2FA and sets a temporary password; the owner types the password, never the assistant
- [ ] Every sign-in step is in the audit log with the visitor's address (through `TRUST_PROXY`)

## Phase 2, Two-factor

- [ ] TOTP 30 s ±1 step, replay-protected by last used step; secret sealed with AES-256-GCM; issuer is the organization name
- [ ] 10 recovery codes, HMAC-hashed, single use, regenerable; use is audited and notified
- [ ] Trusted devices: hashed cookie token, 0–90 days from Settings → Security
- [ ] Reminder, not enforcement: dismissible banner returns after 7 days (1–90), reminder emails at day 1, 7 and 30 sent once each, a 2FA column and filter on Users
- [ ] Admin reset of a user's 2FA needs step-up, is audited and emails the user
- [ ] Step-up: password or TOTP within the last 10 minutes, grants in `step_up_grants`, 5 wrong tries end the session
- [ ] Wrong TOTP codes: the sign-in attempt ends after 5

## Phase 3, Access

- [ ] Permission registry synced to the database at start; renames applied once from a single list
- [ ] Fixed Super Admin: every permission now and in future, not editable, bypasses location scoping and feature switches but not 2FA, step-up or audit; the last active one cannot be disabled or anonymised
- [ ] Reserved permissions can never be granted to another role: `roles.manage`, `settings.security.manage`, `backups.restore`, `users.superadmin.manage`
- [ ] Multiple roles per user, union of permissions; optional location scope per assignment, enforced by one `ScopedRepository` helper
- [ ] Deny by default: a Viewer reaches no admin screen or endpoint (verified by test)
- [ ] Invitation: single-use hashed token, 72 hours; the `invited` user row is removed when it expires so the email can be reused; a new link cancels the old
- [ ] Deactivate signs the person out everywhere at once; history is kept; anonymise replaces name and email and revokes sessions
- [ ] Route metadata drives both the server-component guard and the generated navigation; no hand-written nav list
- [ ] Permission matrix edits need step-up and are audited

## Phase 4, Organization and settings

- [ ] One organization per database; `organization_id` on every table
- [ ] Exactly one head office, which cannot be made inactive; locations are never deleted
- [ ] Settings sections save independently, are versioned, and secrets never come back to the browser ("set / not set")
- [ ] Changing legal name, tax number, country or currency asks for step-up; Security, Email and Maintenance sections ask for step-up
- [ ] Settings cache invalidates by outbox event; a cached value from an older shape is read again (version-keyed cache)
- [ ] Every save checks the record's `version`; a stale save says so instead of overwriting
- [ ] Email provider presets are data only; "Send test email" sends to the signed-in address without saving
- [ ] Notifications: per-type defaults, per-user overrides, bell with live updates

## Phase 5, Theme, landing and mobile

- [ ] One brand colour produces every token for light and dark; every text/background pair is WCAG 2.2 AA (unit tests over all presets and a spread of custom colours); a colour white text cannot be read on is refused
- [ ] Status and chart colours never change with the brand
- [ ] Tokens are injected before first paint with a nonce; nothing is emitted for the built-in look
- [ ] Brand assets: PNG, JPG or WebP up to 1 MB, type and size read from the bytes, SVG refused, served back only as a picture
- [ ] Enforced CSP with nonces; no inline scripts; `frame-ancestors 'none'`
- [ ] Landing wording comes from Settings; contact form is rate limited, has a honeypot, stores nothing but an audit row
- [ ] Core flows pass at 375, 820 and 1440 px with axe; touch targets ≥ 44 px on phones; PWA installs

## Phase 6, Backup and restore

- [ ] `pg_dump -F c` plus a manifest (version, migration id, timestamp, checksum, key fingerprint), AES-256-GCM streamed with a fresh nonce per file
- [ ] A rotated key is detected from the fingerprint before a restore fails
- [ ] Targets behind one adapter (`local` always; `s3` optional); retention 14 daily / 8 weekly / 12 monthly per target
- [ ] Nightly job at 02:00 organization time; "Back up now" needs step-up and is audited; pre-release backup from the release command
- [ ] Restore from the CLI stops the app, restores into a fresh database, migrates forward if older, swaps and health-checks; in-app restore only schedules with a typed confirmation
- [ ] Weekly restore drill restores the latest backup into a scratch database, checks row counts, records `restore_tested_at`, notifies on failure
- [ ] A missed backup raises an admin notification

## Phase 7, Operations

- [ ] Scheduled jobs: declared in code, never run twice at once, "catch up" runs once after the worker was off, pause/resume/run now audited and live
- [ ] Background jobs: live counts, history with retry/cancel/remove, each audited; Bull Board behind admin auth on the web app's origin
- [ ] Audit log screen filters by actor, action, entity and date; CSV export needs step-up and is itself audited
- [ ] Health details: database, Redis, worker heartbeat, mail, disk, last backup
- [ ] Release: version `YYYY.MM.DD-<sha>`, pre-release backup, migrate, restart, health check, automatic rollback; demo client first; migrations are add-only within one release

## Phase 8, Hardening

- [ ] Threat model reviewed; `pnpm audit` clean at high severity; accessibility audit passed; sign-in load test recorded
- [ ] Every 1.0 acceptance check in the plan's section 14 passes
