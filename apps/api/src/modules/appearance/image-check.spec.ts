import { describe, expect, it } from 'vitest';
import { sniffImage } from './image-check';

describe('sniffImage', () => {
  it('reads a PNG size from the header', () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(8),
      Buffer.from([0, 0, 0, 64, 0, 0, 0, 32]),
    ]);
    expect(sniffImage(png)).toEqual({ type: 'image/png', width: 64, height: 32 });
  });
  it('refuses SVG and anything else', () => {
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a'))).toBeNull();
  });
});
