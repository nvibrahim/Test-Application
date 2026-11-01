import type { MaintenanceTask } from './index';

/** Sign-in attempts after 90 days; expired or revoked sessions, used or expired tokens after 30 days. */
export const retentionCleanup: MaintenanceTask = async ({ prisma, now }) => {
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const [attempts, sessions, resets, grants] = await Promise.all([
    prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: days(90) } } }),
    prisma.session.deleteMany({
      where: { OR: [{ revokedAt: { lt: days(30) } }, { absoluteExpiresAt: { lt: days(30) } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ usedAt: { lt: days(30) } }, { expiresAt: { lt: days(30) } }] },
    }),
    prisma.stepUpGrant.deleteMany({ where: { expiresAt: { lt: days(1) } } }),
  ]);
  return `Removed ${attempts.count} sign-in attempts, ${sessions.count} sessions, ${resets.count} reset tokens, ${grants.count} step-up grants`;
};
