# Threat model (1.0 core)

Reviewed 1 November 2026 against the code as built, not the plan. Format: what we protect, who
we expect to attack it, how, and which control answers each attack with the test that proves it.
Items marked **open** are accepted risks or work for a later release.

## Assets

1. People's accounts (passwords, two-factor secrets, sessions).
2. The organization's data in PostgreSQL and its backups.
3. Secrets at rest: `AUTH_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY`, SMTP password, off-site
   storage credentials.
4. The audit log (its completeness is what makes everything else accountable).
5. Availability for the people who use it during the working day.

## Attackers

- **Outsider on the internet**: no account; sees the landing page, sign-in and the public API.
- **Phished or guessed credentials**: has a password, not the phone.
- **Insider with a role**: a Member or Administrator acting beyond their role.
- **Someone with the server**: a copy of the database or of the backup files, or a shell on
  the host, but not the `.env`.
- **Supply chain**: a malicious or vulnerable dependency.

## Attacks and controls

| #   | Attack                                                            | Control                                                                                                                                                                                                                                                                                    | Proof                                                                         |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | Password guessing online                                          | Argon2id (64 MiB, t=3) so each guess is slow; growing delay after 5 wrong passwords, lock after 10 in 15 minutes, per-address limit; throttle **fails closed** when Redis is down; sign-in answers identically for unknown email and wrong password                                        | `auth.e2e-spec.ts` (lockout, same message), `throttle.service.ts`             |
| 2   | Weak or breached passwords                                        | zxcvbn score ≥ 3 and a Have I Been Pwned k-anonymity check at set and change time; policy in Settings → Security                                                                                                                                                                           | `password-policy.test.ts`, `auth.e2e-spec.ts`                                 |
| 3   | Stolen password, no phone                                         | TOTP with a 1-step window and replay refusal, recovery codes hashed with HMAC and burned on use, trusted-device cookie bound to the user and expiring; reminders push everyone to enable it                                                                                                | `two-factor.e2e-spec.ts`, `two-factor.spec.ts`                                |
| 4   | Session theft                                                     | Opaque 256-bit token, only its SHA-256 stored; HttpOnly, SameSite=Lax, `__Host-` prefix and Secure in production; idle and absolute expiry; instant revocation (cache dropped); password change signs out every other session                                                              | `auth.e2e-spec.ts` (sessions, revoke)                                         |
| 5   | Cross-site request forgery                                        | Double-submit token in a header plus Origin check on every write; cookies are SameSite=Lax                                                                                                                                                                                                 | `auth.e2e-spec.ts` (postRaw refused), `access.e2e-spec.ts`                    |
| 6   | Cross-site scripting                                              | Enforced CSP with a per-request nonce, no inline scripts, `default-src 'none'` on the API; React escaping; brand pictures validated by bytes and SVG refused; the audit drawer renders JSON as text                                                                                        | `appearance.e2e-spec.ts` (SVG refused), `proxy.ts`                            |
| 7   | Privilege escalation through the API                              | Deny-by-default guard: every route needs an explicit rule, the boot check refuses to start otherwise; permissions resolved from the database on each request (cache dropped on role change); reserved permissions can never be granted; the last Super Admin cannot be removed or disabled | `access.e2e-spec.ts`, `route-check.ts`, `permissions.test.ts`                 |
| 8   | Dangerous actions with a stolen but live session                  | Step-up (password or code, 10 minutes) on invitations, role changes, settings sections marked sensitive, backups, exports, feature switches, restore; restore also needs the reserved permission and the word RESTORE                                                                      | `access.e2e-spec.ts`, `backups.e2e-spec.ts`, `operations.e2e-spec.ts`         |
| 9   | Reading two-factor secrets or SMTP passwords from a database copy | AES-256-GCM with per-row additional data (user id, setting key, target id); key only in `.env`; key fingerprint stored so a wrong key is detected; `inspower keys rotate` re-seals everything                                                                                              | `crypto.spec.ts`, `operations` CLI, `key-rotation.md`                         |
| 10  | Reading backups from disk or the off-site bucket                  | Every backup streamed through AES-256-GCM with a fresh nonce; files mode 0600; the manifest checksum detects tampering; the key is never in the bucket                                                                                                                                     | `backup-file.spec.ts`, `backups.e2e-spec.ts`                                  |
| 11  | Tampering with the audit log                                      | Database trigger refuses UPDATE and DELETE; writes happen in the same transaction as the change; action names validated; export is itself logged                                                                                                                                           | `transaction.e2e-spec.ts`, `audit` tests                                      |
| 12  | Abuse of public endpoints                                         | Contact form: honeypot, per-address and per-email limits, nothing stored but an audit row; health is shallow without a session; appearance is read-only with ETag                                                                                                                          | `appearance.e2e-spec.ts`                                                      |
| 13  | Insider exporting data                                            | `audit.export` and `backups.run` are separate permissions, step-up protected and audited; backups download encrypted                                                                                                                                                                       | `operations.e2e-spec.ts`, `backups.e2e-spec.ts`                               |
| 14  | Denial of service                                                 | Limits on every body (JSON 100 KB default, pictures 2 MB); per-address throttles; queues bounded; `pg_dump` runs in the worker, not the API                                                                                                                                                | partial: **open**, see below                                                  |
| 15  | Vulnerable dependency                                             | `pnpm audit --prod --audit-level high` in CI; `minimumReleaseAge` of one day on installs; a single image rebuilt on every push to main                                                                                                                                                     | `ci.yml`, `release.yml`, Phase 8 audit: 0 findings after upgrading nodemailer |
| 16  | Leaking secrets through the API or logs                           | Settings return `secretsSet`, never the value; off-site targets never return the secret; job summaries redact fields named password, secret, token or key; structured logs carry request ids, never bodies                                                                                 | `settings.e2e-spec.ts`, `backups.e2e-spec.ts`, `job-runs.ts`                  |
| 17  | Lost phone, lost owner                                            | `inspower admin recover` (console access needed), administrator two-factor reset with step-up; both audited and both notify                                                                                                                                                                | `lost-two-factor-or-owner-account.md`, `two-factor.e2e-spec.ts`               |

## Open items (accepted for 1.0)

- **Application-level request rate limiting** beyond sign-in, reset and contact is left to Caddy
  (per-client `rate_limit` directive is a one-line change) and to the queue bounds. Record:
  revisit when a module exposes a heavy public endpoint.
- **One organization per database** means a bug in a `where` clause cannot leak across clients.
  The `organization_id` column is on every table for a future shared mode; row-level security
  would be added then, not before.
- **Bull Board** is read-mostly but its own actions (retry, remove) are not audited; it therefore
  needs `jobs.manage` and is reached only with the session cookie. The app's Jobs screen is the
  audited path.
- **Email as a channel**: password reset and invitations trust the mailbox. Two-factor and
  step-up limit what a mailbox alone can do; SPF, DKIM and DMARC are the operator's job
  (noted in `docs/handover.md`).
- **Host compromise** with the `.env` defeats the encryption at rest by design; the runbooks
  cover rotation and restore. Disk encryption on the host is recommended.
