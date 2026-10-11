import { describe, expect, it } from 'vitest';
import {
  extractDateKey,
  formatDateKey,
  isDateKey,
  parseDateKey,
} from '../src/utils/date-key';

describe('date-key', () => {
  it('isDateKey accepts yyyy-mm-dd only', () => {
    expect(isDateKey('2026-10-11')).toBe(true);
    expect(isDateKey('2026/10/11')).toBe(false);
    expect(isDateKey('not-a-date')).toBe(false);
    expect(isDateKey('')).toBe(false);
  });

  it('parseDateKey / formatDateKey round-trip UTC', () => {
    const d = parseDateKey('2026-10-11');
    expect(d.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(formatDateKey(d)).toBe('2026-10-11');
  });

  it('extractDateKey from ISO or date key', () => {
    expect(extractDateKey('2026-10-11T15:30:00.000Z')).toBe('2026-10-11');
    expect(extractDateKey('2026-10-11')).toBe('2026-10-11');
    expect(extractDateKey(null)).toBeNull();
    expect(extractDateKey('nope')).toBeNull();
  });
});