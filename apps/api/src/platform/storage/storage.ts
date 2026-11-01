import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** File content lives behind this interface: local disk now, S3-compatible later. */
export interface StorageAdapter {
  put(key: string, content: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const safeKey = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;

export class LocalDiskStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!safeKey.test(key) || key.includes('..')) throw new Error('Storage key is not allowed');
    return path.join(this.root, key);
  }

  async put(key: string, content: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export function checksumOf(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}
