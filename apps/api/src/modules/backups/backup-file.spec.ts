import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { decryptFromFile, encryptToFile, verifyFile, WrongBackupKeyError } from './backup-file';

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

describe('backup file', () => {
  it('round-trips, verifies, and refuses the wrong key or a changed byte', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bk-'));
    const file = path.join(dir, 'x.dump.enc');
    const key = randomBytes(32);
    const content = randomBytes(100_000);
    const written = await encryptToFile(Readable.from([content]), file, key);
    expect(written.sizeBytes).toBe(8 + 8 + 12 + content.length + 16);
    await verifyFile(file, key, written);
    expect((await collect(await decryptFromFile(file, key))).equals(content)).toBe(true);

    await expect(decryptFromFile(file, randomBytes(32))).rejects.toBeInstanceOf(
      WrongBackupKeyError,
    );

    const bytes = await readFile(file);
    bytes[60] = (bytes[60] ?? 0) ^ 0xff;
    await writeFile(file, bytes);
    await expect(verifyFile(file, key, written)).rejects.toThrow(/does not match/);
    await expect(verifyFile(file, key)).rejects.toThrow();
  });
});
