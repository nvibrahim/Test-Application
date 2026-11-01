# Runbook: backup and restore

Written before the backup code, built to this runbook, and rehearsed. A backup that has never
been restored is a hope, not a backup: the weekly restore drill and this rehearsal are 1.0
acceptance checks.

## What a backup is

| Part              | Detail                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content           | `pg_dump -F c` of the organization's database (custom format, compressed)                                                                                                                                                       |
| File name         | `inspower-<yyyyMMdd-HHmmss>-<scheduled                                                                                                                                                                                          | manual | pre_release>.dump.enc` |
| Encryption        | AES-256-GCM, streamed. File layout: 8-byte magic `INSPBK01`, 8-byte key fingerprint, 12-byte nonce, ciphertext, 16-byte authentication tag. Key: `BACKUP_ENCRYPTION_KEY` (32 bytes, base64)                                     |
| Manifest          | `<file>.manifest.json` beside it: app version, latest migration id, started and finished at, SHA-256 of the **encrypted** file, size, key fingerprint, kind, and row counts of a few tables for the drill                       |
| Where             | Always the local target (`BACKUP_DIR`, a mounted volume in production). Optionally one off-site target: any S3-compatible store (Backblaze B2, Cloudflare R2, Wasabi, MinIO, AWS)                                               |
| When              | Nightly at the time in Settings → Backups (default 02:00 organization time); before every release (`inspower release`); on **Back up now** (step-up, audited)                                                                   |
| Retention         | Grandfather-father-son: keep the newest 14 daily, 8 weekly (Sundays), 12 monthly (first of the month), configurable per client; applied to each target by the `backup-retention` job                                            |
| Not in the backup | `.env`. The keys are the owner's to keep: `AUTH_ENCRYPTION_KEY` unlocks two-factor secrets and sealed settings; `BACKUP_ENCRYPTION_KEY` unlocks the backups. Keep both in the password manager, **separately** from the backups |

The key fingerprint in the file and the manifest means a rotated or wrong key is detected before
a restore fails half-way.

## Daily operation

Nothing. The nightly job runs; **Administration → Backups** shows the last backup, the last
off-site copy and the last drill, and a missed backup (no success in 26 hours) raises an
administrator notification and email. Health details show the same.

## Taking a backup by hand

- In the app: **Administration → Backups → Back up now** (asks for your password or a code).
- On the server: `pnpm inspower backup run --kind manual` (in a container: `docker compose -p inspower-<slug> run --rm api cli backup run`).

## Verifying a backup (the drill)

The `restore-drill` job runs weekly: it takes the newest completed backup, decrypts it, restores
it into a scratch database `<database>_drill`, compares the row counts of `users`, `roles`,
`audit_logs` and `app_settings` with the manifest, records `restore_tested_at` on the backup,
drops the scratch database, and notifies administrators on any failure.

By hand: **Backups → Verify now** on a row, or `pnpm inspower backup verify <file>` (checks the
authentication tag and the checksum; add `--restore` to run the full drill).

## Restoring for real

Two ways. Both need the `BACKUP_ENCRYPTION_KEY` the backup was taken with.

### From the command line (preferred; the person is at the keyboard)

```bash
pnpm inspower backup restore <file-or-backup-id> --confirm
```

What it does, in order, and stops at the first failure:

1. Checks the key fingerprint and the checksum against the manifest.
2. Turns maintenance mode on (everyone except the Super Admin sees the message).
3. Restores into a **fresh** database `<database>_restore` with `pg_restore --no-owner --no-acl`.
4. Runs the migrations on it (`prisma migrate deploy`), so an older backup is brought forward.
5. Swaps: terminates connections, renames the live database to `<database>_old_<timestamp>` and
   `<database>_restore` to the live name. The API and worker reconnect by themselves.
6. Turns maintenance mode off and writes `backups.restore.completed` to the audit log.

The old database stays as `<database>_old_<timestamp>` until you drop it. Time it; the
rehearsal below took under a minute on an empty database.

### From the app

**Backups → Restore…** needs the reserved `backups.restore` permission (Super Admin), step-up,
and typing **RESTORE** into the dialog. It only _schedules_ the restore: the worker performs
steps 1 to 6 above and notifies administrators when it is done. Anything entered since the
backup is lost, so the dialog says the backup's date twice.

## Lost key

Without `BACKUP_ENCRYPTION_KEY` the backups cannot be read. There is no recovery. This is why the
key lives in the password manager and a printed copy, in two places, and why the fingerprint is
shown on **Settings → Backups** so a mismatch is noticed before it matters.

## Off-site target

**Administration → Backups → Targets**: name, endpoint, region, bucket, prefix, access key and
secret (sealed at rest). Then choose it in **Settings → Backups**. Each night's file and manifest
are copied there after the local write succeeds; the Backups page shows the last successful copy.

## Rehearsal log

| Date       | Who           | What                                                                                                                                                                                                                                  | Time                                                      |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1 Nov 2026 | build session | `inspower backup run --kind pre_release`, `backup verify <file> --drill`, then `backup restore <file> --confirm` against the browser-test database with the API and worker running; both kept working; `/api/v1/health` ok afterwards | backup 1.3 s, drill 1 s, restore 2.5 s (150 KiB database) |
