import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open as openFile, stat } from 'node:fs/promises';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BACKUP_FINGERPRINT_BYTES,
  BACKUP_MAGIC,
  BACKUP_NONCE_BYTES,
  BACKUP_TAG_BYTES,
  type Backup,
} from '@inspower/shared';
import { keyFingerprint } from '../../platform/crypto/crypto';

/**
 * The encrypted backup file: magic, key fingerprint, nonce, AES-256-GCM ciphertext, tag.
 * Streaming both ways, so a database larger than memory is fine. The fingerprint lets a wrong
 * or rotated key be reported before a restore is attempted.
 */
const HEADER_BYTES = BACKUP_MAGIC.length + BACKUP_FINGERPRINT_BYTES + BACKUP_NONCE_BYTES;

export interface BackupManifest {
  version: 1;
  fileName: string;
  kind: Backup['kind'];
  appVersion: string;
  migrationId: string | null;
  startedAt: string;
  finishedAt: string;
  /** SHA-256 of the encrypted file, hex */
  checksum: string;
  sizeBytes: number;
  keyFingerprint: string;
  rowCounts: Record<string, number>;
}

export function backupFileName(kind: Backup['kind'], at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `inspower-${stamp}-${kind}.dump.enc`;
}

export function manifestFileName(fileName: string): string {
  return `${fileName}.manifest.json`;
}

export class WrongBackupKeyError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`The backup was encrypted with key ${expected}; this installation has ${actual}`);
  }
}

/** Encrypts `source` into `file`. Resolves with the checksum and size of the written file. */
export async function encryptToFile(
  source: Readable,
  file: string,
  key: Buffer,
): Promise<{ checksum: string; sizeBytes: number }> {
  const nonce = randomBytes(BACKUP_NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const hash = createHash('sha256');
  let size = 0;
  const header = Buffer.concat([
    Buffer.from(BACKUP_MAGIC, 'ascii'),
    Buffer.from(keyFingerprint(key), 'hex'),
    nonce,
  ]);
  let started = false;
  const framed = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      if (!started) {
        started = true;
        this.push(header);
      }
      callback(null, cipher.update(chunk));
    },
    flush(callback) {
      if (!started) this.push(header);
      const last = cipher.final();
      if (last.length) this.push(last);
      this.push(cipher.getAuthTag());
      callback();
    },
  });
  const counting = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      size += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(source, framed, counting, createWriteStream(file, { mode: 0o600 }));
  return { checksum: hash.digest('hex'), sizeBytes: size };
}

export interface BackupHeader {
  keyFingerprint: string;
  nonce: Buffer;
  dataStart: number;
  dataEnd: number;
  tag: Buffer;
}

export async function readHeader(file: string): Promise<BackupHeader> {
  const { size } = await stat(file);
  if (size < HEADER_BYTES + BACKUP_TAG_BYTES)
    throw new Error('The file is too short to be a backup');
  const handle = await openFile(file, 'r');
  try {
    const head = Buffer.alloc(HEADER_BYTES);
    await handle.read(head, 0, HEADER_BYTES, 0);
    if (head.subarray(0, BACKUP_MAGIC.length).toString('ascii') !== BACKUP_MAGIC) {
      throw new Error('The file is not an Inspower backup');
    }
    const tag = Buffer.alloc(BACKUP_TAG_BYTES);
    await handle.read(tag, 0, BACKUP_TAG_BYTES, size - BACKUP_TAG_BYTES);
    return {
      keyFingerprint: head
        .subarray(BACKUP_MAGIC.length, BACKUP_MAGIC.length + BACKUP_FINGERPRINT_BYTES)
        .toString('hex'),
      nonce: head.subarray(BACKUP_MAGIC.length + BACKUP_FINGERPRINT_BYTES, HEADER_BYTES),
      dataStart: HEADER_BYTES,
      dataEnd: size - BACKUP_TAG_BYTES - 1,
      tag,
    };
  } finally {
    await handle.close();
  }
}

/**
 * A readable stream of the plaintext. The stream errors (and nothing after it is trusted) if
 * the tag does not match; callers that cannot undo what they consumed verify first.
 */
export async function decryptFromFile(file: string, key: Buffer): Promise<Readable> {
  const header = await readHeader(file);
  const expected = keyFingerprint(key);
  if (header.keyFingerprint !== expected) {
    throw new WrongBackupKeyError(header.keyFingerprint, expected);
  }
  const decipher = createDecipheriv('aes-256-gcm', key, header.nonce);
  decipher.setAuthTag(header.tag);
  const out = new PassThrough();
  const source =
    header.dataEnd >= header.dataStart
      ? createReadStream(file, { start: header.dataStart, end: header.dataEnd })
      : createReadStream(file, { start: header.dataStart, end: header.dataStart - 1 });
  pipeline(source, decipher, out).catch((err: Error) => out.destroy(err));
  return out;
}

/** Checks the tag and, when a manifest is given, the checksum. Reads the whole file. */
export async function verifyFile(
  file: string,
  key: Buffer,
  manifest?: Pick<BackupManifest, 'checksum' | 'sizeBytes'> | null,
): Promise<{ sizeBytes: number; checksum: string }> {
  const hash = createHash('sha256');
  let size = 0;
  await pipeline(
    createReadStream(file),
    new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        hash.update(chunk);
        cb();
      },
    }),
  );
  const checksum = hash.digest('hex');
  if (manifest && (manifest.checksum !== checksum || manifest.sizeBytes !== size)) {
    throw new Error('The file does not match its manifest (checksum or size differ)');
  }
  const plain = await decryptFromFile(file, key);
  await pipeline(
    plain,
    new Transform({
      transform(_chunk, _enc, cb) {
        cb();
      },
    }),
  );
  return { sizeBytes: size, checksum };
}
