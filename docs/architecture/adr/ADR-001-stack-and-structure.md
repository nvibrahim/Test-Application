# ADR-001: Keep the stack, raise the bar on structure

|            |                 |
| ---------- | --------------- |
| **Status** | Accepted        |
| **Date**   | 1 November 2026 |
| **Phase**  | 0, Foundation   |

## Context

The plan (section 5) asks for the same stack as the reference application, built from scratch
in a new repository with a stricter structure. This record fixes the choices made while
scaffolding, so later phases do not reopen them.

## Decisions

1. **Stack**: TypeScript 6 strict on Node 24; pnpm workspaces + turbo (`envMode: strict`,
   `minimumReleaseAge` of one day for new package versions); Next.js 16 App Router with React 19
   and Tailwind 4; NestJS 12 on Express 5; Prisma 7 with the `pg` driver adapter on
   PostgreSQL 17; Valkey through ioredis and BullMQ; Zod 4 for every contract; vitest for unit and
   integration tests; Playwright + axe for browser tests; oxlint for packages and the API, ESLint
   (Next's config) for the web app; Prettier.
2. **Prisma 7, not 8**: 8 is a release candidate at the time of writing; the plan names 7.
   The client is generated into `apps/api/src/generated/prisma` (ignored by git) with the
   `prisma-client` generator in CommonJS, matching the NestJS build.
3. **Shared package is ESM, consumed by a CommonJS API**: the package exports `import` and
   `default` conditions and Node 24 loads it with `require(esm)`. The API stays CommonJS because
   NestJS decorators and `nest build` are simplest that way.
4. **One image, five roles** via `infra/docker/entrypoint.sh` (`web`, `api`, `worker`,
   `migrate`, `cli`). The web app's `/api/*` rewrite target is fixed at build time to
   `http://api:4000`, the service name inside every client's network, so one build serves every
   client.
5. **Deny by default from day one**: every route carries an access-rule decorator and the boot
   fails otherwise (`assertEveryRouteHasARule`). In Phase 0 the rules are markers; Phase 1 and 3
   add the guard that enforces them.
6. **Audit and outbox in the same transaction** through one `TransactionService.run` helper. The
   audit table is append-only by database trigger. Audit actions and realtime event names share
   the `module.entity.action` pattern, enforced by the shared package.
7. **Configuration refuses placeholders in production**: a `change-me` key stops the boot; in
   local development it is replaced with a fixed local key and a warning is logged.
8. **Local development without PowerShell**: Docker Compose for services and `pnpm` scripts
   that run the same on Windows (Docker Desktop or WSL), macOS and Linux. The `inspower` command
   is a TypeScript CLI.
9. **Reference data from Intl**: countries and currencies are generated from the Node runtime's
   Unicode data at seed time rather than typed by hand; per-country currency and calling codes
   are listed only for the countries served first and extended in code.

## Consequences

- Phase 1 can add sign-in without touching the platform code: sessions, guards and the first
  controllers slot into `modules/`.
- Any future change of ORM, framework or packaging is an ADR of its own.
- PostgreSQL 16 is acceptable for local tests when 17 is not available (the container image used
  in CI and production is 17).
