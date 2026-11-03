import { describe, expect, it } from 'vitest';
import { deviceLabel } from './sessions.service';

describe('deviceLabel', () => {
  it('names browser and system without fingerprinting', () => {
    expect(
      deviceLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 Edg/128.0',
      ),
    ).toBe('Edge on Windows');
    expect(
      deviceLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iOS');
    expect(deviceLabel(null)).toBeNull();
  });
});
