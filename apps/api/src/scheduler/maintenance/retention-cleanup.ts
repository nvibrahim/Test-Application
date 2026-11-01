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
  // An invitation that expired un-accepted: the invited user row goes too, so the email can be reused.
  const stale = await prisma.user.findMany({
    where: {
      status: 'invited',
      invitations: { every: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { not: null } }] } },
      createdAt: { lt: new Date(now.getTime() - 72 * 3_600_000) },
    },
    select: { id: true, organizationId: true, email: true },
  });
  for (const u of stale) {
    await prisma.user.delete({ where: { id: u.id } });
    await prisma.auditLog.create({
      data: {
        organizationId: u.organizationId,
        action: 'users.invitation.expired',
        entityType: 'user',
        entityId: u.id,
        changes: { email: u.email },
      },
    });
  }
  return `Removed ${attempts.count} sign-in attempts, ${sessions.count} sessions, ${resets.count} reset tokens, ${grants.count} step-up grants, ${stale.length} expired invitations`;
};
