/** Picture type from the file's own bytes, never its name. SVG is refused: it can carry scripts. */
export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

export function sniffImage(
  bytes: Buffer,
): { type: ImageType; width: number; height: number } | null {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { type: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG: walk the segments to the first SOF marker for the size
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return { type: 'image/jpeg', width: 0, height: 0 };
      const marker = bytes[i + 1]!;
      const len = bytes.readUInt16BE(i + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          type: 'image/jpeg',
          height: bytes.readUInt16BE(i + 5),
          width: bytes.readUInt16BE(i + 7),
        };
      }
      i += 2 + len;
    }
    return { type: 'image/jpeg', width: 0, height: 0 };
  }
  if (
    bytes.length >= 30 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const chunk = bytes.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8 ')
      return {
        type: 'image/webp',
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    if (chunk === 'VP8L') {
      const b = bytes.readUInt32LE(21);
      return { type: 'image/webp', width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X')
      return {
        type: 'image/webp',
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    return { type: 'image/webp', width: 0, height: 0 };
  }
  return null;
}

export const BRAND_SLOTS = ['logo_light', 'logo_dark', 'favicon', 'sign_in_image'] as const;
export type BrandSlot = (typeof BRAND_SLOTS)[number];
export const BRAND_MAX_BYTES = 1024 * 1024;
