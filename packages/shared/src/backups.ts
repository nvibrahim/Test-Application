import { z } from 'zod';

export const backupKindSchema = z.enum(['scheduled', 'manual', 'pre_release']);
export const backupStatusSchema = z.enum(['running', 'completed', 'failed']);

export const backupSchema = z.object({
  id: z.string().uuid(),
  kind: backupKindSchema,
  status: backupStatusSchema,
  fileName: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  checksum: z.string().nullable(),
  keyFingerprint: z.string().nullable(),
  appVersion: z.string().nullable(),
  migrationId: z.string().nullable(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  restoreTestedAt: z.string().datetime().nullable(),
  offsiteCopiedAt: z.string().datetime().nullable(),
  offsiteError: z.string().nullable(),
  error: z.string().nullable(),
  startedByName: z.string().nullable(),
});
export type Backup = z.infer<typeof backupSchema>;

export const backupStatusSummarySchema = z.object({
  lastSuccessAt: z.string().datetime().nullable(),
  lastOffsiteAt: z.string().datetime().nullable(),
  lastDrillAt: z.string().datetime().nullable(),
  lastDrillPassed: z.boolean().nullable(),
  keyFingerprint: z.string(),
  localDir: z.string(),
  offsiteTarget: z.string().nullable(),
  missed: z.boolean(),
});
export type BackupStatusSummary = z.infer<typeof backupStatusSummarySchema>;

export const backupsResponseSchema = z.object({
  backups: z.array(backupSchema),
  status: backupStatusSummarySchema,
});

export const backupTargetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['s3']),
  name: z.string(),
  isEnabled: z.boolean(),
  config: z.object({
    endpoint: z.string().nullable(),
    region: z.string(),
    bucket: z.string(),
    prefix: z.string(),
    accessKeyId: z.string(),
  }),
  secretSet: z.boolean(),
});
export type BackupTarget = z.infer<typeof backupTargetSchema>;
export const backupTargetsResponseSchema = z.object({ targets: z.array(backupTargetSchema) });

export const createBackupTargetSchema = z.object({
  name: z.string().trim().min(1).max(60),
  endpoint: z.string().url().nullable().default(null),
  region: z.string().trim().min(1).max(40).default('auto'),
  bucket: z.string().trim().min(3).max(63),
  prefix: z.string().trim().max(200).default(''),
  accessKeyId: z.string().trim().min(1).max(200),
  secretAccessKey: z.string().min(1).max(500),
});

export const restoreRequestSchema = z.object({
  /** The word RESTORE, typed */
  confirmation: z.literal('RESTORE'),
});

/** The encrypted file layout, shared with the CLI and the worker. */
export const BACKUP_MAGIC = 'INSPBK01';
export const BACKUP_FINGERPRINT_BYTES = 8;
export const BACKUP_NONCE_BYTES = 12;
export const BACKUP_TAG_BYTES = 16;
