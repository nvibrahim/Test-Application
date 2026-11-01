# ADR-004: Operations choices (Phases 6 and 7)

Date: 1 November 2026. Status: accepted.

## Decisions

1. **Backup engine as plain functions.** `apps/api/src/modules/backups/engine.ts` has no Nest
   dependency so the API, the worker and the command line share one implementation and the
   integration tests run it against a real database. The Nest service only queues work and reads.
2. **Encrypted file layout** `INSPBK01` + 8-byte key fingerprint + 12-byte nonce + ciphertext +
   16-byte tag, streamed. The fingerprint is the first 8 bytes of SHA-256 of the key, the same
   value every sealed row already carries, so one fingerprint identifies a key everywhere.
3. **Restore swaps databases** (`<db>_restore` renamed over the live name, the old one kept as
   `<db>_old_<stamp>`) rather than restoring into the live database. The API and worker
   reconnect through their pools; nothing restarts. Rehearsed in the runbook.
4. **PostgreSQL 17 client in the image** from the PGDG repository, so `pg_dump` matches the
   `postgres:17` service; Debian bookworm ships 15.
5. **Scheduled job and feature switch rows are keyed globally.** Their primary keys are the
   registry keys; the `organization_id` column is carried for a future shared mode but not used
   in lookups. In a one-organization database this removes a class of stale-row bugs.
6. **Bull Board on the API** at `/api/v1/admin/queues`, guarded by the session cookie and
   `jobs.manage`, with its own relaxed CSP. The plan said "on the web app's origin": the web app
   forwards `/api/*`, so the board is reached on that origin without a second server.
7. **Realtime starts with long-polling** and upgrades to WebSocket, and the Socket.IO path has no
   trailing slash. The web app's proxy redirected the slashed path, which silently broke live
   updates in every environment without Caddy. Found by the Phase 6 browser test.
8. **Downloads go through fetch, not links.** A link cannot answer a step-up challenge; the
   browser fetches the file (asking for step-up when needed) and saves the blob under the name
   from Content-Disposition. Used by the backup download and the audit CSV export.
9. **Release and client commands are TypeScript over `docker compose`**, planned as pure step
   lists that are unit tested; `--dry-run` prints them. The live rehearsal needs a host with
   Docker, which the build container did not have; it is the first task on the operations host.
