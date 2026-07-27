import { describe, expect, it } from 'vitest';

import { validateDateRange } from './date-range.js';

describe('validateDateRange', () => {
  it('accepts a range exactly at the cap', () => {
    const result = validateDateRange('2026-04-01', '2026-04-11', 10, 'get_fires_range');
    expect(result).toEqual({ ok: true, value: { days: 10 } });
  });

  it('rejects a range one day over the cap', () => {
    const result = validateDateRange('2026-04-01', '2026-04-12', 10, 'get_fires_range');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toBe(
      'Date range spans 11 days; get_fires_range allows a maximum of 10 days. Narrow the range and try again.',
    );
  });

  it('rejects end before start', () => {
    const result = validateDateRange('2026-04-10', '2026-04-05', 10, 'get_fires_range');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toBe('`end` must not be before `start`.');
  });

  it('accepts a single-day range (start === end)', () => {
    expect(validateDateRange('2026-04-01', '2026-04-01', 10, 'get_fires_range')).toEqual({
      ok: true,
      value: { days: 0 },
    });
  });

  it('rejects a day-of-month that does not exist, instead of silently rolling it over', () => {
    const result = validateDateRange('2026-02-25', '2026-02-30', 10, 'get_fires_range');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toBe('"2026-02-30" is not a valid calendar date.');
  });

  it('rejects a month-end overflow (April has 30 days)', () => {
    const result = validateDateRange('2026-04-25', '2026-04-31', 10, 'get_fires_range');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toBe('"2026-04-31" is not a valid calendar date.');
  });

  it('applies a different cap and tool name independently (get_cams_summary)', () => {
    const atCap = validateDateRange('2026-01-01', '2026-05-20', 139, 'get_cams_summary');
    expect(atCap).toEqual({ ok: true, value: { days: 139 } });

    const overCap = validateDateRange('2026-01-01', '2026-05-21', 139, 'get_cams_summary');
    expect(overCap.ok).toBe(false);
    if (overCap.ok) throw new Error('Expected failure result');
    expect(overCap.error).toBe(
      'Date range spans 140 days; get_cams_summary allows a maximum of 139 days. Narrow the range and try again.',
    );
  });
});
