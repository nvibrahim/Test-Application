# Handover: Inspower Core 1.0

Everything a new developer or operator needs on day one. Written for someone who has not read
the code.

## What it is

The foundation every Inspower business module plugs into: landing page, sign-in with two-step
verification, users with roles and permissions, organization and settings, theme, encrypted
backups with restore drills, audit log, notifications, background jobs, health. One image, one
PostgreSQL database per client, one Caddy in front.

## Where things are

| Need                                                 | Place                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| The approved design                                  | `docs/architecture/new-application-plan.md`                                  |
| Decisions that differ from it                        | `docs/architecture/adr/ADR-001` to `ADR-004`                                 |
| What each phase proved, with the test that proves it | `docs/architecture/behaviour-checklist.md`                                   |
| What changed, phase by phase                         | `docs/CHANGELOG.md`                                                          |
| Threat model                                         | `docs/architecture/threat-model.md`                                          |
| Accessibility and load-test records                  | `docs/architecture/accessibility-audit.md`, `docs/architecture/load-test.md` |
| Runbooks (do this when that happens)                 | `docs/runbooks/`                                                             |
| Screens                                              | `docs/architecture/screens/`                                                 |

## Running it

```bash
corepack enable && pnpm install
cp .env.example .env && pnpm inspower keys generate   # paste the two keys into .env
pnpm services:up                                       # PostgreSQL, Valkey, Mailpit in Docker
pnpm db:deploy && pnpm inspower admin create           # schema, then the first Super Admin
pnpm dev                                               # web on :3000, api on :4000, worker
```

Checks: `pnpm check` (lint, typecheck, unit), `pnpm test:integration` (real database),
`pnpm test:e2e` (browser at phone, tablet and desktop widths, with axe). CI runs all of them and
builds the image; `release.yml` publishes it.

## Operating it

- **Deploy a client**: `pnpm inspower client new <slug> --version <v> --domain <host>`, then
  `admin create` inside the stack, then add the host to `infra/caddy/Caddyfile`.
- **Release**: `pnpm inspower release <version> --client demo`, look, then `--all`.
  Rollback is automatic on a failed health check; by hand with `client rollback`.
- **Hold**: `pnpm inspower client hold <slug> on|off`.
- **Backups**: nightly, encrypted, off-site when a target is set in Settings → Backups; the
  weekly drill proves they restore. Restore from the CLI (`inspower backup restore`) or, scheduled,
  from Administration → Backups.
- **Watch**: Dashboard health card, Administration → Jobs, Administration → Audit log, and the
  administrator notifications (failed or missed backup, failed drill, lockouts, security settings
  changes, maintenance mode).

Keep both encryption keys from each client's `.env` in the password manager, separately from
the backups. Without them the two-factor secrets and the backups cannot be read.

## Adding a module

A module is a folder under `apps/api/src/modules/<name>` plus pages under `apps/web/src/app/(app)/<name>`:

1. Declare its permissions in `packages/shared/src/permissions/<name>.ts` and add them to the
   registry; the API syncs them at start and the Super Admin holds them automatically.
2. Declare its settings section, notification types, scheduled jobs and feature switches in the
   shared package the same way; the screens pick them up.
3. Every route carries an access decorator (the API refuses to boot otherwise); every write goes
   through `TransactionService.run` with an audit call; realtime events through `emit`.
4. Register pages in `apps/web/src/lib/routes.ts`; navigation is generated from it.
5. Add a `.prisma` file for its tables (UUID v7 ids, `organization_id`, timestamps, `version`),
   a migration, tests at the three levels, a CHANGELOG entry.

## Things the operator must do outside the app

- DNS and TLS: Caddy issues certificates once the host resolves to the server.
- Email reputation: SPF, DKIM and DMARC for the sending domain.
- Host disk encryption and OS updates.
- Rehearse the release runbook once on the operations host (the build environment had no
  Docker daemon); record it in the runbook's log.
- Run Lighthouse on the landing page from the operations host and record the score in the
  accessibility record.

## Known limits (1.0)

- One organization per database; shared mode would need row-level security first.
- Bull Board actions are not audited (use the Jobs screen for audited actions).
- No SSO; passwords plus TOTP only. The module contract leaves room for OIDC later.
