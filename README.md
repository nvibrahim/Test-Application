# Inspower Core

The foundation platform: landing page, sign-in, two-factor authentication, users with roles and
permissions, organization and settings, theme and appearance, backup and restore, audit log,
notifications, background jobs and health. Business modules plug into this core later.

The approved design is [`docs/architecture/new-application-plan.md`](docs/architecture/new-application-plan.md).
Decisions that differ from it are recorded as ADRs in `docs/architecture/adr/`. Progress is in
[`docs/CHANGELOG.md`](docs/CHANGELOG.md). Start with [`docs/handover.md`](docs/handover.md) if
you are new; the runbooks are in `docs/runbooks/`.

## What is here (1.0: Phases 0 to 8)

| Part                            | Where                         | Notes                                                                        |
| ------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| Web app (Next.js 16)            | `apps/web`                    | App Router, route groups, design tokens, system health page                  |
| API, worker and CLI (NestJS 12) | `apps/api`                    | One codebase, three entry points: `main.ts`, `worker/main.ts`, `cli/main.ts` |
| Shared contracts                | `packages/shared`             | Zod schemas, error codes, permission registry, naming rules                  |
| Design system                   | `packages/ui`                 | Tokens (`styles/globals.css`) and shadcn-style components                    |
| Database schema                 | `apps/api/prisma/schema`      | One `.prisma` file per module, 35 tables, append-only audit trigger          |
| Local services                  | `infra/compose`               | PostgreSQL 17, Valkey, Mailpit, optional MinIO                               |
| Image and proxy                 | `infra/docker`, `infra/caddy` | One image with `web`, `api`, `worker`, `migrate`, `cli` roles                |
| CI                              | `.github/workflows/ci.yml`    | lint, typecheck, unit, integration (service containers), e2e, image          |

## Running it locally

Requirements: Node 24 (`.nvmrc`), pnpm 10 (`corepack enable`), Docker (Docker Desktop, or Docker
inside WSL on Windows). The same commands work on Windows, macOS and Linux.

```bash
cp .env.example .env            # then replace the two change-me keys: pnpm inspower keys generate
pnpm install
pnpm services:up                # PostgreSQL, Valkey and Mailpit in Docker
pnpm db:deploy                  # apply the migrations
pnpm db:seed                    # countries and currencies
pnpm inspower admin create      # the first Super Admin: you type the email, name and a temporary password
pnpm dev                        # API on http://127.0.0.1:4000, web on http://localhost:3000
```

Sign in at http://localhost:3000/sign-in with the temporary password; you will be asked to choose
your own and to set up the organization. http://localhost:3000/health shows every dependency. Emails land in Mailpit at
http://127.0.0.1:8025. Stop the services with `pnpm services:down` (data is kept).

## Checks

| Command                 | What it runs                                                                |
| ----------------------- | --------------------------------------------------------------------------- |
| `pnpm check`            | lint, typecheck and unit tests for every package                            |
| `pnpm test:integration` | API tests against the real PostgreSQL and Valkey (`inspower_test` database) |
| `pnpm test:e2e`         | Browser tests at phone, tablet and desktop widths (from Phase 1)            |
| `pnpm format`           | Prettier                                                                    |
| `pnpm build`            | Production build of every app                                               |

## Command line

`pnpm inspower <command>` is the cross-platform admin command (it replaces shell scripts):

| Command         | Purpose                                                      |
| --------------- | ------------------------------------------------------------ |
| `keys generate` | Two fresh 32-byte keys for `.env`                            |
| `db check`      | Confirms the database answers and names the latest migration |
| `version`       | The running version                                          |

`admin create` and `admin recover` arrive with Phase 1; `backup run|restore|verify` with Phase 6.

## Rules that every change follows

- Every API route declares `@Public()`, `@SignedIn()` or `@RequirePermissions()`; the API refuses
  to start otherwise.
- Every state-changing request carries the CSRF header and comes from `WEB_ORIGIN`; the browser
  client (`apps/web/src/lib/api.ts`) does this for you.
- Every write goes through `TransactionService.run`, which commits the change, its audit row and
  any realtime event together. Audit actions are named `module.entity.action`.
- The product name is never a literal in code: `DEFAULT_APP_NAME` now, Settings → General later.
- Secrets at rest use the AES-256-GCM helper with a key fingerprint; tokens are stored hashed.
- Screens use design tokens only; every text/background pair meets WCAG 2.2 AA in both themes.
