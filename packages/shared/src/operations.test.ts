import { describe, expect, it } from 'vitest';
import { featureKeyPattern, featureKeys, featureVisible } from './features.js';
import { csvCell, csvLine } from './operations.js';

describe('csv', () => {
  it('quotes commas, quotes and line breaks and neutralises formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe('');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvLine(['x', 1, null])).toBe('x,1,');
  });
});

describe('feature switches', () => {
  it('has well-formed keys and the documented visibility', () => {
    for (const k of featureKeys) expect(k).toMatch(featureKeyPattern);
    const sa = { isSuperAdmin: true, selected: false };
    const me = { isSuperAdmin: false, selected: false };
    const picked = { isSuperAdmin: false, selected: true };
    expect(featureVisible(undefined, sa)).toBe(false);
    expect(featureVisible('off', sa)).toBe(false);
    expect(featureVisible('on', me)).toBe(true);
    expect(featureVisible('super_admin_only', me)).toBe(false);
    expect(featureVisible('super_admin_only', sa)).toBe(true);
    expect(featureVisible('selected_users', me)).toBe(false);
    expect(featureVisible('selected_users', picked)).toBe(true);
  });
});
