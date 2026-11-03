import { describe, expect, it } from 'vitest';
import { canSeeLocation, locationWhere, visibleLocationIds } from './scoped';

describe('location scoping', () => {
  it('a Super Admin sees everything', () => {
    expect(
      visibleLocationIds({
        isSuperAdmin: true,
        restrictedLocationIds: ['a'],
        assignmentLocationIds: ['a'],
      }),
    ).toBeNull();
  });
  it('no restriction and an unscoped role sees everything', () => {
    expect(
      visibleLocationIds({
        isSuperAdmin: false,
        restrictedLocationIds: [],
        assignmentLocationIds: [null, 'a'],
      }),
    ).toBeNull();
  });
  it('roles scoped to locations limit the view; a restriction narrows it further', () => {
    expect(
      [
        ...visibleLocationIds({
          isSuperAdmin: false,
          restrictedLocationIds: [],
          assignmentLocationIds: ['a', 'b'],
        })!,
      ].sort(),
    ).toEqual(['a', 'b']);
    expect([
      ...visibleLocationIds({
        isSuperAdmin: false,
        restrictedLocationIds: ['b', 'c'],
        assignmentLocationIds: ['a', 'b'],
      })!,
    ]).toEqual(['b']);
    expect([
      ...visibleLocationIds({
        isSuperAdmin: false,
        restrictedLocationIds: ['c'],
        assignmentLocationIds: [null],
      })!,
    ]).toEqual(['c']);
  });
  it('builds the where clause and answers canSee', () => {
    expect(locationWhere(null)).toEqual({});
    expect(locationWhere(new Set(['a']))).toEqual({ locationId: { in: ['a'] } });
    expect(canSeeLocation(new Set(['a']), 'b')).toBe(false);
    expect(canSeeLocation(new Set(['a']), null)).toBe(false);
    expect(canSeeLocation(null, null)).toBe(true);
  });
});
