import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checksumOf, LocalDiskStorage } from './storage';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'inspower-storage-'));
});
afterAll(async () => rm(dir, { recursive: true, force: true }));

describe('LocalDiskStorage', () => {
  it('stores, reads and deletes a file under a nested key', async () => {
    const s = new LocalDiskStorage(dir);
    await s.put('brand/logo.png', Buffer.from('png'));
    expect((await s.get('brand/logo.png')).toString()).toBe('png');
    await s.delete('brand/logo.png');
    await expect(s.get('brand/logo.png')).rejects.toThrow();
  });
  it('refuses keys that could escape the root', async () => {
    const s = new LocalDiskStorage(dir);
    await expect(s.put('../x', Buffer.from(''))).rejects.toThrow(/not allowed/);
    await expect(s.put('/etc/passwd', Buffer.from(''))).rejects.toThrow(/not allowed/);
  });
  it('checksums content', () => {
    expect(checksumOf(Buffer.from('a'))).toHaveLength(64);
  });
});
