# Changelog

Each phase ends with an entry here. Dates are the day the phase was finished.

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
