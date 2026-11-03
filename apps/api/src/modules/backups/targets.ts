import { createReadStream } from 'node:fs';
import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { z } from 'zod';
import { openText, seal, type Sealed } from '../../platform/crypto/crypto';

/**
 * Off-site copies go to any S3-compatible store. The configuration (including the secret) is
 * sealed with AUTH_ENCRYPTION_KEY in `backup_targets.config_encrypted`; the API never returns
 * the secret, only whether one is set.
 */
export const s3TargetConfigSchema = z.object({
  endpoint: z.string().url().nullable(),
  region: z.string().min(1),
  bucket: z.string().min(3),
  prefix: z.string(),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
});
export type S3TargetConfig = z.infer<typeof s3TargetConfigSchema>;

export function sealTargetConfig(config: S3TargetConfig, key: Buffer, targetId: string): string {
  return JSON.stringify(seal(JSON.stringify(config), key, `backup-target:${targetId}`));
}

export function openTargetConfig(encrypted: string, key: Buffer, targetId: string): S3TargetConfig {
  const sealed = JSON.parse(encrypted) as Sealed;
  return s3TargetConfigSchema.parse(JSON.parse(openText(sealed, key, `backup-target:${targetId}`)));
}

export interface OffsiteTarget {
  put(objectName: string, file: string, contentType: string): Promise<void>;
  delete(objectName: string): Promise<void>;
  /** Proves the credentials and the bucket; writes and removes a tiny probe object. */
  test(): Promise<void>;
}

export class S3Target implements OffsiteTarget {
  private readonly client: S3Client;
  constructor(private readonly config: S3TargetConfig) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private key(objectName: string): string {
    const prefix = this.config.prefix.replace(/^\/+|\/+$/g, '');
    return prefix ? `${prefix}/${objectName}` : objectName;
  }

  async put(objectName: string, file: string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(objectName),
        Body: createReadStream(file),
        ContentType: contentType,
      }),
    );
  }

  async delete(objectName: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(objectName) }),
    );
  }

  async test(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    const probe = `.inspower-probe-${Date.now()}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: this.key(probe), Body: 'ok' }),
    );
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(probe) }),
    );
  }
}
