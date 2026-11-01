import { describe, expect, it } from 'vitest';
import { defineRoute } from './routes';

describe('defineRoute', () => {
  it('accepts page metadata', () => {
    expect(defineRoute({ title: 'Users', permission: 'users.read' }).title).toBe('Users');
  });
  it('refuses an empty title', () => {
    expect(() => defineRoute({ title: '' })).toThrow();
  });
});
