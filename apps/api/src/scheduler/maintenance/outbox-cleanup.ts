import type { MaintenanceTask } from './index';

export const outboxCleanup: MaintenanceTask = async ({ prisma, now }) => {
  const cutoff = new Date(now.getTime() - 86_400_000);
  const result = await prisma.outboxEvent.deleteMany({ where: { publishedAt: { lt: cutoff } } });
  return `Removed ${result.count} published events older than a day`;
};
