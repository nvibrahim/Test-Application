# Starter prompt for the new application

Copy everything below the line into a new Claude Code session opened on the **Test Application** repository.

---

Read `docs/architecture/new-application-plan.md` in this repository from start to finish before doing anything. It is the approved architecture plan for a new application called **Inspower Core**: a foundation platform with a landing page, sign-in, two-factor authentication (optional, with reminders), password rules (minimum 8), users with a fixed all-powerful Super Admin role plus editable roles and permissions, organization and settings, theme and appearance, backup and restore, audit log, notifications, background jobs and health. It must work on phones, tablets and desktops. No outside system is integrated.

Rules for this work:

1. Build **from scratch in this repository**. Do not copy code from any other repository. The plan's section 1 names an older application only as a reference for behaviour.
2. Follow the plan's technology choices (section 5), repository layout (section 6), database design (section 7), module designs (section 8), security design (section 9) and the module contract. If you must deviate, write a short ADR in `docs/architecture/adr/` explaining why, then continue.
3. Work **phase by phase** in the order of section 14. Finish Phase 0 completely before starting Phase 1. Every phase ends with `pnpm check` green, the app running with `docker compose up` and `pnpm dev`, and a short entry in `docs/CHANGELOG.md`.
4. Start now with **Phase 0 (Foundation)**:
   - pnpm + turbo monorepo on Node 24, packages named `@inspower/*`, `apps/web` (Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui), `apps/api` (NestJS 12, Prisma 7 on PostgreSQL 17, Valkey, BullMQ, Socket.IO), `packages/shared`, `packages/ui`, `packages/config-typescript`.
   - Docker Compose for Postgres, Valkey and Mailpit; a multi-stage Dockerfile with `web`, `api`, `worker`, `migrate` and `cli` roles; a Caddyfile.
   - Prisma schema split into one file per module with the core tables from section 7, and the first migration.
   - Platform code: config loading with validation, database, Redis, mail, structured logging with request ids, AES-256-GCM crypto helper with key fingerprint, transaction helper that writes audit rows and outbox events, health endpoint.
   - CI workflow that runs lint, typecheck, unit tests, integration tests against service containers, and builds the image.
   - A short README, `.env.example`, and `docs/architecture/behaviour-checklist.md` listing the behaviours each later phase must prove with a test.
5. Commit in small steps with clear messages. Do not create a pull request unless asked.
6. When Phase 0 is done, stop and report: what was built, how to run it, what `pnpm check` printed, and what Phase 1 will start with.
