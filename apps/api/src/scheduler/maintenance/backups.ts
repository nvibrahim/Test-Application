import {
  applyRetention,
  checkMissed,
  readBackupSettings,
  runBackup,
  runDrill,
} from '../../modules/backups/engine';
import type { MaintenanceTask } from './index';

export const backupNightly: MaintenanceTask = async (ctx) => {
  const { id, fileName } = await runBackup(ctx, {
    organizationId: ctx.organizationId,
    kind: 'scheduled',
  });
  const settings = await readBackupSettings(ctx.prisma, ctx.organizationId);
  if (settings.pingUrl) {
    await fetch(settings.pingUrl, { method: 'POST', body: fileName }).catch((err: Error) =>
      ctx.logger.warn({ err }, 'backup ping failed'),
    );
  }
  return `Backup ${id} written as ${fileName}`;
};

export const backupRetention: MaintenanceTask = async (ctx) => {
  const missed = await checkMissed(ctx, ctx.organizationId, ctx.now);
  const result = await applyRetention(ctx, ctx.organizationId);
  return missed ? `${result}; administrators told about the missed backup` : result;
};

export const restoreDrill: MaintenanceTask = async (ctx) => {
  const settings = await readBackupSettings(ctx.prisma, ctx.organizationId);
  if (settings.restoreDrill === 'off') return 'Restore drill is off in Settings';
  return runDrill(ctx, ctx.organizationId);
};
