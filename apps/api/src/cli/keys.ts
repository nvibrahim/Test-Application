import { randomBytes } from 'node:crypto';
import { effectiveKey, type Env } from '../platform/config/config';
import { keyFingerprint, open, seal, type Sealed } from '../platform/crypto/crypto';
import { createPrismaClient } from '../platform/database/prisma.service';

/**
 * `inspower keys generate` prints two fresh keys. `inspower keys rotate --new <base64>` re-seals
 * everything sealed with AUTH_ENCRYPTION_KEY (two-factor secrets, secret settings, off-site
 * target credentials) under the new key, in one transaction, and tells you what to change in
 * .env. Backups are not re-encrypted: keep the old BACKUP_ENCRYPTION_KEY until every backup made
 * with it has aged out (docs/runbooks/key-rotation.md).
 */
export async function keysCommand(env: Env | null, args: string[]): Promise<number> {
  const [sub, ...rest] = args;
  if (sub === 'generate') {
    console.log(`AUTH_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
    console.log(`BACKUP_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
    return 0;
  }
  if (sub === 'rotate' && env) {
    const idx = rest.indexOf('--new');
    const raw = idx >= 0 ? rest[idx + 1] : undefined;
    const newKey = raw ? Buffer.from(raw, 'base64') : null;
    if (!newKey || newKey.length !== 32) {
      console.error(
        'Usage: inspower keys rotate --new <32 random bytes, base64>  (from `inspower keys generate`)',
      );
      return 2;
    }
    return rotate(env, newKey, rest.includes('--dry-run'));
  }
  console.error('Usage: inspower keys <generate | rotate --new <key> [--dry-run]>');
  return 2;
}

async function rotate(env: Env, newKey: Buffer, dryRun: boolean): Promise<number> {
  const oldKey = effectiveKey(env, 'AUTH_ENCRYPTION_KEY');
  const from = keyFingerprint(oldKey);
  const to = keyFingerprint(newKey);
  if (from === to) {
    console.error('The new key is the same as the current one.');
    return 2;
  }
  const prisma = createPrismaClient(env.DATABASE_URL);
  let twoFactor = 0;
  let settings = 0;
  let targets = 0;
  let skipped = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const row of await tx.userTwoFactor.findMany()) {
        if (row.keyFingerprint !== from) {
          skipped += 1;
          continue;
        }
        const plain = open(
          { value: row.secretEncrypted, keyFingerprint: row.keyFingerprint },
          oldKey,
          `totp:${row.userId}`,
        );
        const sealed = seal(plain, newKey, `totp:${row.userId}`);
        if (!dryRun)
          await tx.userTwoFactor.update({
            where: { userId: row.userId },
            data: { secretEncrypted: sealed.value, keyFingerprint: sealed.keyFingerprint },
          });
        twoFactor += 1;
      }
      for (const row of await tx.appSetting.findMany({ where: { isSecret: true } })) {
        const sealed = row.value as unknown as Sealed;
        if (sealed.keyFingerprint !== from) {
          skipped += 1;
          continue;
        }
        const aad = `settings:${row.organizationId}:${row.section}:${row.key}`;
        const plain = open(sealed, oldKey, aad);
        const next = seal(plain, newKey, aad);
        if (!dryRun)
          await tx.appSetting.update({
            where: { id: row.id },
            data: { value: next as unknown as object },
          });
        settings += 1;
      }
      for (const row of await tx.backupTarget.findMany({
        where: { configEncrypted: { not: null } },
      })) {
        const sealed = JSON.parse(row.configEncrypted!) as Sealed;
        if (sealed.keyFingerprint !== from) {
          skipped += 1;
          continue;
        }
        const aad = `backup-target:${row.id}`;
        const plain = open(sealed, oldKey, aad);
        const next = seal(plain, newKey, aad);
        if (!dryRun)
          await tx.backupTarget.update({
            where: { id: row.id },
            data: { configEncrypted: JSON.stringify(next) },
          });
        targets += 1;
      }
    });
  } finally {
    await prisma.$disconnect();
  }
  console.log(
    `${dryRun ? 'Would re-seal' : 'Re-sealed'} ${twoFactor} two-factor secrets, ${settings} secret settings and ${targets} off-site targets from key ${from} to ${to}.${skipped ? ` ${skipped} rows were under another key and were left alone.` : ''}`,
  );
  if (!dryRun) {
    console.log(
      '\nNow set AUTH_ENCRYPTION_KEY to the new value in .env and restart api and worker. Sessions stay valid; two-factor codes keep working.',
    );
  }
  return 0;
}
