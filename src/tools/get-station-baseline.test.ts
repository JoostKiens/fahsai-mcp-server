import { describe, expect, it, vi } from 'vitest';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { NORMAL_STATION_BASELINE } from '../logic/station-baseline.fixtures.js';
import { createGetStationBaselineHandler, getStationBaselineInputSchema } from './get-station-baseline.js';

function fakeClient(get: FahsaiClient['get']): FahsaiClient {
  return { get };
}

describe('getStationBaselineInputSchema', () => {
  it('defaults full to false and leaves month/day undefined', () => {
    const parsed = getStationBaselineInputSchema.parse({ station_id: '225572' });
    expect(parsed.full).toBe(false);
    expect(parsed.month).toBeUndefined();
    expect(parsed.day).toBeUndefined();
  });

  it('rejects an out-of-range month/day', () => {
    expect(getStationBaselineInputSchema.safeParse({ station_id: '225572', month: 13, day: 1 }).success).toBe(
      false,
    );
    expect(getStationBaselineInputSchema.safeParse({ station_id: '225572', month: 1, day: 32 }).success).toBe(
      false,
    );
  });
});

describe('createGetStationBaselineHandler', () => {
  it('rejects month without day', async () => {
    const get = vi.fn();
    const handler = createGetStationBaselineHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', full: false, month: 7 });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('returns the current-season default when no month/day/full is given', async () => {
    // NORMAL_STATION_BASELINE has at least one row in every season's month range, so `season`
    // is always defined regardless of the real wall-clock date the test happens to run on.
    // `today` isn't asserted here — it only matches when the run date happens to be 07-26/27,
    // which is covered instead by summarizeStationBaselineDefault's own unit tests with a fixed date.
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { data: NORMAL_STATION_BASELINE, minYear: 2021, maxYear: 2026 },
    });
    const handler = createGetStationBaselineHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', full: false });

    expect(get).toHaveBeenCalledWith('/api/stations/225572/baseline');
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { stationId: string; season?: unknown };
    expect(structured.stationId).toBe('225572');
    expect(structured.season).toBeDefined();
  });

  it('returns a specific day when month/day are given', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { data: NORMAL_STATION_BASELINE, minYear: 2021, maxYear: 2026 },
    });
    const handler = createGetStationBaselineHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', full: false, month: 7, day: 27 });

    const structured = result.structuredContent as { day?: { month: number; day: number; thin: boolean } };
    expect(structured.day).toEqual({ month: 7, day: 27, medianPm25: 15.3, p25Pm25: 30.4, p75Pm25: 41.1, n: 3, thin: true });
  });

  it('returns the full curve and notes ignored month/day when full wins', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { data: NORMAL_STATION_BASELINE, minYear: 2021, maxYear: 2026 },
    });
    const handler = createGetStationBaselineHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', full: true, month: 7, day: 27 });

    const structured = result.structuredContent as { rows?: unknown[]; note?: string };
    expect(structured.rows).toHaveLength(NORMAL_STATION_BASELINE.length);
    expect(structured.note).toBe('`full` was requested — the `month`/`day` params were ignored.');
  });

  it('treats a malformed success body (data not an array) as empty instead of throwing', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: null, minYear: null, maxYear: null } });
    const handler = createGetStationBaselineHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', full: false });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toContain('No baseline data for station 225572');
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetStationBaselineHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', full: false });

    expect(result.isError).toBe(true);
  });
});
