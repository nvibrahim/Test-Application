# Runbook: key rotation

Two keys, two different jobs.

| Key                     | Protects                                                                         | Rotation                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `AUTH_ENCRYPTION_KEY`   | Two-factor secrets, secret settings (SMTP password), off-site target credentials | `inspower keys rotate`, minutes                                                |
| `BACKUP_ENCRYPTION_KEY` | Every backup file                                                                | Change the key going forward; keep the old one until its backups have aged out |

Rotate when a key may have been seen by someone who should not have it, when a person who held
the password-manager entry leaves, or once a year as a habit.

## AUTH_ENCRYPTION_KEY

1. Generate a key: `pnpm inspower keys generate` (use the first line).
2. Rehearse: `pnpm inspower keys rotate --new <key> --dry-run` reports how many rows would move
   and how many are already under another key.
3. Hold the client if you like (`inspower client hold <slug> on`); not required, the re-seal is
   one transaction.
4. `pnpm inspower keys rotate --new <key>`.
5. Put the new value in `.env` (or `clients/<slug>/.env`) and restart `api` and `worker`.
6. Sign in with a two-factor code to prove the secrets still open. Settings → Email → send a test
   email to prove the SMTP password still opens.
7. Update the password manager; remove the old key from it after a week.

Sessions are not affected (they are opaque hashes, not encrypted values).

## BACKUP_ENCRYPTION_KEY

Backups are not re-encrypted; each file carries the fingerprint of the key that made it.

1. Generate a key (`inspower keys generate`, second line).
2. Put it in `.env` and restart `worker` and `api`. Tonight's backup uses the new key; Settings →
   Backups shows the new fingerprint.
3. Keep the **old** key in the password manager, labelled with the date, for as long as the
   longest retention (12 monthly backups by default, so a year). A restore of an older backup
   needs it: set `BACKUP_ENCRYPTION_KEY` to the old value for that one `inspower backup restore`.
4. `inspower backup verify --drill` on the next nightly backup proves the new key end to end.

## Lost key

`AUTH_ENCRYPTION_KEY` lost: two-factor secrets cannot be opened. `inspower admin recover <email>`
resets the owner; administrators reset everyone else's two-factor from Users. Re-enter the SMTP
password and off-site credentials.

`BACKUP_ENCRYPTION_KEY` lost: backups made with it are unreadable. Take a backup now with a new
key. There is no other recovery, which is why the key lives in two places.
