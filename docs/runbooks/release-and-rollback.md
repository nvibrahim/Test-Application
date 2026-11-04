# Runbook: release and rollback

One image serves every client. A release is: publish the image, then move clients to it one at
a time, demo first. Nothing here needs a shell script; every command is `pnpm inspower ...`
(or `docker compose run --rm api cli ...` inside a client stack) and works on Windows, macOS
and Linux.

## Versions

`YYYY.MM.DD-<7-char sha>`, for example `2026.11.01-a17db4e`. The release workflow
(`.github/workflows/release.yml`) builds and pushes `ghcr.io/<owner>/inspower:<version>` on
every push to `main`; its summary shows the exact release command.

## Before a release

- CI is green on `main` (lint, typecheck, unit, integration, browser tests at three widths).
- Migrations in this release are **add-only** (new tables, new nullable columns, new indexes).
  A destructive change waits for the following release, after every client runs the code that no
  longer reads the old shape. This is what makes rollback safe.
- The CHANGELOG has an entry for the version.

## Release

```bash
pnpm inspower release 2026.11.01-a17db4e --client demo
```

Steps, in order, stopping at the first failure:

1. Pull the image.
2. Pre-release backup (`inspower backup run --kind pre_release`, kept by retention like any other).
3. `prisma migrate deploy` in a one-off `migrate` container.
4. `docker compose up -d` for api, worker and web on the new version.
5. Health check on `/api/v1/health` (up to a minute).

A failure at step 3, 4 or 5 writes the previous version back into `clients/<slug>/.env`, restarts
the three roles on it and checks health again. Because migrations are add-only, the previous
code runs against the migrated schema.

When demo looks right (sign in, open a few screens, check Backups and Jobs):

```bash
pnpm inspower release 2026.11.01-a17db4e --all
```

`--all` releases `demo` first and stops before touching anyone else if it fails. Add
`--dry-run` to any command to print the steps without running them.

## Rollback by hand

```bash
pnpm inspower client rollback <slug> --to 2026.10.25-9f8e7d6
```

Puts the roles back on that version and checks health. The database is not rolled back; if a
release's migration must be undone, restore the pre-release backup instead
(`docs/runbooks/backup-and-restore.md`), which is why one is taken every time.

## Holding a client

```bash
pnpm inspower client hold <slug> on
pnpm inspower client hold <slug> off
```

Turns maintenance mode on or off (`inspower maintenance on|off` inside the stack). Everyone but
the roles allowed in Settings → Maintenance sees the message.

## Status

```bash
pnpm inspower client status
```

## New client

```bash
pnpm inspower client new <slug> --version 2026.11.01-a17db4e --domain app.client.example
```

Writes `clients/<slug>/.env` with fresh database, cache and encryption keys (store both keys in
the password manager immediately), starts PostgreSQL and Valkey, creates the schema, starts the
three roles and checks health. Then create the owner:

```bash
docker compose -p inspower-<slug> --env-file clients/<slug>/.env -f infra/compose/docker-compose.prod.yml run --rm api cli admin create
```

Add the host to Caddy (`infra/caddy/Caddyfile`) and reload it. On a server that already runs nginx, use `infra/nginx/inspower-site.conf` instead; see `deploy-to-shared-vps.md`.

## Rehearsal log

| Date       | Who           | What                                                                                                                                                                                                                                          | Result  |
| ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1 Nov 2026 | build session | `inspower release --dry-run` and `client new --dry-run` printed the planned steps; the sequence is unit tested (`compose.spec.ts`). No Docker daemon in the build container, so the live rehearsal is the first item for the operations host. | planned |
