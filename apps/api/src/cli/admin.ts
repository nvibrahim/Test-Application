import { input, password as passwordPrompt } from '@inquirer/prompts';
import {
  DEFAULT_APP_NAME,
  defaultSecuritySettings,
  emailSchema,
  evaluatePassword,
  describePasswordProblem,
  SUPER_ADMIN_ROLE_KEY,
} from '@inspower/shared';
import type { Env } from '../platform/config/config';
import { createPrismaClient } from '../platform/database/prisma.service';
import { writeAudit } from '../platform/audit/audit';
import { ensureSuperAdminRole } from '../modules/access/access-sync';
import { ARGON2_OPTIONS } from '../modules/auth/passwords.service';
import { AuthActions } from '../modules/auth/auth.actions';
import argon2 from 'argon2';

/**
 * `inspower admin create` makes the first Super Admin. The owner types the email, the name and
 * a temporary password; nothing is echoed. `inspower admin recover <email>` is the last resort
 * for a lost password and phone: it removes two-factor, sets a temporary password, signs out
 * every session and forces a change at the next sign-in.
 *
 * Non-interactive use (CI, browser tests): `--email`, `--name` and the password in the
 * environment variable INSPOWER_ADMIN_PASSWORD, so it never appears in a process list.
 */
export async function adminCommand(env: Env, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === 'create') return createAdmin(env, parseFlags(rest));
  if (sub === 'recover') return recoverAdmin(env, parseFlags(rest));
  console.error('Usage: inspower admin <create|recover> [--email x] [--name y]');
  return 2;
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a?.startsWith('--')) {
      const value = args[i + 1];
      flags[a.slice(2)] = value && !value.startsWith('--') ? value : 'true';
      if (value && !value.startsWith('--')) i += 1;
    } else if (a && !flags['email']) {
      flags['email'] = a;
    }
  }
  return flags;
}

async function askPassword(
  flags: Record<string, string>,
  context: { email: string; fullName: string },
  label: string,
): Promise<string> {
  const fromEnv = process.env['INSPOWER_ADMIN_PASSWORD'];
  const check = (value: string) => {
    const result = evaluatePassword(value, defaultSecuritySettings.password, {
      ...context,
      appName: process.env['APP_NAME'] ?? DEFAULT_APP_NAME,
      isSuperAdmin: true,
    });
    return result.ok ? true : result.problems.map(describePasswordProblem).join(' ');
  };
  if (fromEnv) {
    const ok = check(fromEnv);
    if (ok !== true) throw new Error(`INSPOWER_ADMIN_PASSWORD is not acceptable: ${ok}`);
    return fromEnv;
  }
  if (flags['non-interactive'])
    throw new Error('Set INSPOWER_ADMIN_PASSWORD for non-interactive use');
  for (;;) {
    const first = await passwordPrompt({
      message: `${label} (at least 12 characters; nothing is shown)`,
      mask: '*',
    });
    const ok = check(first);
    if (ok !== true) {
      console.error(ok);
      continue;
    }
    const second = await passwordPrompt({ message: 'Type it again', mask: '*' });
    if (first !== second) {
      console.error('The two entries differ. Try again.');
      continue;
    }
    return first;
  }
}

async function createAdmin(env: Env, flags: Record<string, string>): Promise<number> {
  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const existing = await prisma.userRole.count({
      where: { role: { key: SUPER_ADMIN_ROLE_KEY } },
    });
    if (existing > 0) {
      console.error(
        'A Super Admin already exists. Use `inspower admin recover <email>` if they are locked out.',
      );
      return 1;
    }
    const email = emailSchema.parse(flags['email'] ?? (await input({ message: 'Email address' })));
    const fullName = (flags['name'] ?? (await input({ message: 'Full name' }))).trim();
    if (!fullName) throw new Error('A name is needed');
    const temp = await askPassword(flags, { email, fullName }, 'Temporary password');
    const hash = await argon2.hash(temp, ARGON2_OPTIONS);

    await prisma.$transaction(async (tx) => {
      let org = await tx.organization.findFirst();
      org ??= await tx.organization.create({ data: { legalName: 'New organization' } });
      const roleId = await ensureSuperAdminRole(tx, org.id);
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email,
          emailNormalized: email,
          fullName,
          status: 'active',
          passwordHash: hash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
        },
      });
      await tx.userRole.create({ data: { organizationId: org.id, userId: user.id, roleId } });
      await tx.userPreferences.create({ data: { userId: user.id, organizationId: org.id } });
      await writeAudit(
        tx,
        { organizationId: org.id, actorId: null, requestId: 'cli' },
        {
          action: AuthActions.adminCreated,
          entityType: 'user',
          entityId: user.id,
          changes: { email },
        },
      );
    });
    console.log(
      `Super Admin ${email} created. Sign in at ${env.WEB_ORIGIN}/sign-in and choose your own password.`,
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

async function recoverAdmin(env: Env, flags: Record<string, string>): Promise<number> {
  const prisma = createPrismaClient(env.DATABASE_URL);
  try {
    const email = emailSchema.parse(
      flags['email'] ?? (await input({ message: 'Email address of the Super Admin' })),
    );
    const user = await prisma.user.findFirst({
      where: { emailNormalized: email, roles: { some: { role: { key: SUPER_ADMIN_ROLE_KEY } } } },
    });
    if (!user) {
      console.error('No Super Admin with that email.');
      return 1;
    }
    const temp = await askPassword(
      flags,
      { email, fullName: user.fullName },
      'New temporary password',
    );
    const hash = await argon2.hash(temp, ARGON2_OPTIONS);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          mustChangePassword: true,
          lockedUntil: null,
          passwordChangedAt: new Date(),
          status: 'active',
        },
      });
      await tx.userTwoFactor.deleteMany({ where: { userId: user.id } });
      await tx.recoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.trustedDevice.deleteMany({ where: { userId: user.id } });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'admin_recover' },
      });
      await writeAudit(
        tx,
        { organizationId: user.organizationId, actorId: null, requestId: 'cli' },
        { action: AuthActions.adminRecovered, entityType: 'user', entityId: user.id },
      );
    });
    console.log(
      `Two-factor removed and a temporary password set for ${email}. They must change it at the next sign-in.`,
    );
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}
