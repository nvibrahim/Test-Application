# Runbook: incident

Something is wrong for people using the app. Work the list top to bottom; each line is a minute.

## 1. See

- **Dashboard → System health** (or `GET /api/v1/health/details` with an admin session): which
  check is not OK: database, cache and queues, worker, mail, last backup, disk.
- `pnpm inspower client status` for the container states; `docker compose -p inspower-<slug> logs
--tail 200 api worker web` for the last lines.
- Administration → Jobs: failed jobs and their errors; Scheduled jobs: last error per job.
- Administration → Audit log: what changed last (a settings save, a role change, a restore).

## 2. Stop the bleeding

- **People cannot sign in, or see errors:** `pnpm inspower client hold <slug> on` puts up the
  maintenance message while you work. Administrators (Settings → Maintenance) still get in.
- **A release just happened:** `pnpm inspower client rollback <slug> --to <previous version>`.
- **Disk full:** backups and storage are the usual culprits. `inspower backup prune` applies
  retention now; `docker system prune` frees old images.
- **Worker down:** `docker compose -p inspower-<slug> restart worker`. Scheduled jobs with
  catch-up run their missed slot once on start; the Jobs screen shows it.
- **Mail not sending:** Settings → Email → send a test email tells you which. Email jobs retry
  three times with backoff; failed ones can be retried from the Jobs screen when mail is back.
- **Suspected account compromise:** Users → the person → Sign out everywhere and Reset two-step
  verification; then rotate `AUTH_ENCRYPTION_KEY` if a server may have been read
  (`docs/runbooks/key-rotation.md`).
- **Data damaged:** restore the newest good backup (`docs/runbooks/backup-and-restore.md`).

## 3. Recover

- Take the hold off: `pnpm inspower client hold <slug> off`.
- Check health, sign in, open Backups and Jobs.
- Tell the people affected what happened and what was lost, if anything (the audit log and the
  backup manifest give exact times).

## 4. Write it down

In `docs/runbooks/incidents/<date>-<slug>.md`: what people saw, when it started and ended, what
the cause was, what fixed it, and what change stops it happening again (a check, an alert, a test).
Link it from the CHANGELOG entry of the release that carries the fix.
