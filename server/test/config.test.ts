import { describe, expect, it } from 'vitest';
import { dayKey, jwtSecretProblem, startOfDay } from '../src/common/config';

describe('JWT secret check', () => {
  it('accepts anything outside production', () => {
    expect(jwtSecretProblem(undefined, false)).toBeNull();
  });
  it('refuses a missing, example or short secret in production', () => {
    expect(jwtSecretProblem(undefined, true)).toMatch(/not set/);
    expect(jwtSecretProblem('change-me', true)).toMatch(/example/);
    expect(jwtSecretProblem('change-me-long-random-string-xxxxxxxxxxxx', true)).toMatch(/example/);
    expect(jwtSecretProblem('short', true)).toMatch(/32/);
  });
  it('accepts a long random secret', () => {
    expect(jwtSecretProblem('a'.repeat(64), true)).toBeNull();
  });
});

describe('days in Paris time', () => {
  it('a call at 00:30 in Paris belongs to that Paris day, not the UTC one', () => {
    const at = new Date('2026-11-17T23:30:00Z'); // 00:30 on the 18th in Paris (winter, UTC+1)
    expect(dayKey(at)).toBe('2026-11-18');
    expect(startOfDay(at).toISOString()).toBe('2026-11-17T23:00:00.000Z');
  });
  it('handles summer time', () => {
    const at = new Date('2026-07-01T10:00:00Z');
    expect(startOfDay(at).toISOString()).toBe('2026-06-30T22:00:00.000Z');
  });
  it('goes back whole days, across a time change', () => {
    // 2026-10-25 is the switch to winter time in Paris.
    const at = new Date('2026-10-27T10:00:00Z');
    expect(startOfDay(at, 3).toISOString()).toBe('2026-10-23T22:00:00.000Z');
  });
});
