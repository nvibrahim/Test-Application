# Runbook: a locked-out Super Admin

**When:** the only Super Admin has lost their password _and_ their phone (or has no working
recovery code), or the first administrator must be created.

**Who:** the person with command-line access to the deployment (the owner, or the operator
on the server). Nobody else can do this, by design.

## Create the first Super Admin

```bash
pnpm inspower admin create
```

The command asks for the email, the full name and a temporary password, typed by the owner
and never shown. It refuses if a Super Admin already exists. The person then signs in and is
made to choose their own password (minimum 12 characters for a Super Admin) before anything
else, and to complete the organization setup.

In a container:

```bash
docker compose -p inspower-<slug> run --rm api cli admin create
```

Non-interactive use (CI, scripted set-up): `--email`, `--name` and the password in
`INSPOWER_ADMIN_PASSWORD`, so it never appears in a process list.

## Recover a locked-out Super Admin

```bash
pnpm inspower admin recover <email>
```

What it does, in one transaction, and writes to the audit log as `admin.superadmin.recovered`:

1. Sets a new temporary password (typed by the owner, or from `INSPOWER_ADMIN_PASSWORD`).
2. Removes two-step verification, every recovery code and every trusted device.
3. Signs out every session.
4. Clears any lock-out and forces a password change at the next sign-in.

The person signs in with the temporary password, chooses a new one, and (from Phase 2) sets
up two-step verification again.

## What it does not do

- It does not create or change anyone who is not a Super Admin. Other people are recovered
  from Users → _Reset two-step verification_ (Phase 2) or _Send a new link_ (Phase 3).
- It never prints a password. If the owner forgets the temporary one, run it again.

## Prevention

Keep **two** Super Admin accounts per deployment (Phase 3), and give each real person an
Administrator role for daily work, so a lost phone never locks the whole system.
