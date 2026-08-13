import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import {
  fakePlaceResolver,
  fakeResolvedPlace,
} from '../../shared/place-resolver/place-resolver.fixtures.js';
import {
  EMPTY_CAMS_GRID,
  FULL_CAMS_GRID,
  GRID_WITH_INVALID_READING,
  SMALL_AREA_CAMS_GRID,
} from './handler.fixtures.js';
import {
  computeAreaSummary,
  createGetCamsHandler,
  emptyCamsSummary,
  summarizeCams,
} from './handler.js';
import { CAMS_GRID_MAX } from './schema.js';

describe('computeAreaSummary', () => {
  it('computes mean/median/p95 with AQI categories against a real 9-point grid', () => {
    const summary = computeAreaSummary(SMALL_AREA_CAMS_GRID.pm25s);

    expect(summary.pointCount).toBe(9);
    expect(summary.mean.pm25).toBeCloseTo(9.2778, 3);
    expect(summary.mean.aqiCategory).toBe('Good');
    expect(summary.median).toEqual({ pm25: 9, aqiCategory: 'Good' });
    expect(summary.p95).toEqual({ pm25: 17.7, aqiCategory: 'Moderate' });
  });

  it('degrades every stat to null (never throws) for an empty grid', () => {
    expect(() => computeAreaSummary([])).not.toThrow();
    const summary = computeAreaSummary([]);

    expect(summary.pointCount).toBe(0);
    expect(summary.mean).toEqual({ pm25: null, aqiCategory: null });
    expect(summary.median).toEqual({ pm25: null, aqiCategory: null });
    expect(summary.p95).toEqual({ pm25: null, aqiCategory: null });
  });

  it('excludes an out-of-coverage null cell from the stats instead of coercing it to 0', () => {
    const summary = computeAreaSummary(GRID_WITH_INVALID_READING.pm25s);

    expect(summary.pointCount).toBe(2); // the null cell is excluded, not counted
    expect(summary.mean).toEqual({ pm25: 15, aqiCategory: 'Moderate' }); // mean of 10, 20 — not (10+0+20)/3
    expect(summary.median).toEqual({ pm25: 10, aqiCategory: 'Good' });
    expect(summary.p95).toEqual({ pm25: 20, aqiCategory: 'Moderate' });
  });
});

describe('summarizeCams', () => {
  it('returns a summary-only response by default, without a grid field', () => {
    const summary = summarizeCams(SMALL_AREA_CAMS_GRID, false);

    expect(summary.total).toBe(9);
    expect(summary.grid).toBeUndefined();
    expect(summary.gridTruncated).toBeUndefined();
    expect(summary.note).toBeUndefined();
  });

  it('includes the full, untruncated grid when requested and under the cap', () => {
    const summary = summarizeCams(SMALL_AREA_CAMS_GRID, true);

    expect(summary.grid).toHaveLength(9);
    expect(summary.gridTruncated).toBe(false);
    expect(summary.note).toBeUndefined();
    expect(summary.grid?.[0]).toEqual({ lat: 13, lng: 100.20001, pm25: 3.9, aqiCategory: 'Good' });
  });

  it('caps and evenly, spatially samples the raw grid above CAMS_GRID_MAX, with a note', () => {
    const summary = summarizeCams(FULL_CAMS_GRID, true);

    expect(summary.total).toBe(4599);
    expect(summary.grid).toHaveLength(CAMS_GRID_MAX);
    expect(summary.gridTruncated).toBe(true);
    expect(summary.note).toBe(
      `Showing ${CAMS_GRID_MAX} of 4599 grid points (evenly, spatially sampled).`,
    );

    // Spatially spread, not clustered at low indices (would catch an accidental
    // top-N-by-value-style regression) — first and last sampled points should be far apart.
    const grid = summary.grid ?? [];
    expect(grid[0].lat).not.toBe(grid[grid.length - 1].lat);
    expect(grid[grid.length - 1].lng).toBeGreaterThan(grid[0].lng);
  });

  it('does not include a grid or truncation note by default even for a large grid', () => {
    const summary = summarizeCams(FULL_CAMS_GRID, false);

    expect(summary.total).toBe(4599);
    expect(summary.grid).toBeUndefined();
    expect(summary.summary.pointCount).toBe(4599);
  });

  it('notes how many grid points were excluded from the area summary due to invalid readings', () => {
    const summary = summarizeCams(GRID_WITH_INVALID_READING, false);

    expect(summary.total).toBe(3); // the raw grid still has 3 points
    expect(summary.summary.pointCount).toBe(2); // only 2 fed into the stats
    expect(summary.note).toBe(
      '1 grid point(s) had no valid PM2.5 reading and were excluded from the area summary.',
    );
  });

  it('combines the omitted-reading note with the truncation note when both apply', () => {
    const largeGridWithInvalidReading = {
      lats: [...FULL_CAMS_GRID.lats, 13],
      lngs: [...FULL_CAMS_GRID.lngs, 100],
      pm25s: [...FULL_CAMS_GRID.pm25s, null as unknown as number],
    };

    const summary = summarizeCams(largeGridWithInvalidReading, true);

    expect(summary.gridTruncated).toBe(true);
    expect(summary.note).toBe(
      '1 grid point(s) had no valid PM2.5 reading and were excluded from the area summary. ' +
        `Showing ${CAMS_GRID_MAX} of 4600 grid points (evenly, spatially sampled).`,
    );
  });
});

describe('emptyCamsSummary', () => {
  it('represents "no data" with zero points and null stats', () => {
    const summary = emptyCamsSummary();

    expect(summary.total).toBe(0);
    expect(summary.summary).toEqual(computeAreaSummary(EMPTY_CAMS_GRID.pm25s));
  });
});

describe('createGetCamsHandler', () => {
  it('resolves the place, fetches, and summarizes on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_AREA_CAMS_GRID } });
    const handler = createGetCamsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-07-26' });

    expect(get).toHaveBeenCalledWith('/api/cams', {
      date: '2026-07-26',
      bbox: '98.5,18.3,99.5,19.3',
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(9);
  });

  it('passes include_raw_grid through to the summary', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_AREA_CAMS_GRID } });
    const handler = createGetCamsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({
      place: 'Chiang Mai',
      date: '2026-07-26',
      include_raw_grid: true,
    });

    const structured = result.structuredContent as { grid?: unknown[] };
    expect(structured.grid).toHaveLength(9);
  });

  it('treats a 404 as "not ingested yet" rather than an error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetCamsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2099-01-01' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No CAMS data ingested for 2099-01-01 yet.');
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetCamsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-07-26' });

    expect(result.isError).toBe(true);
  });

  it('returns isError when location resolution fails, without calling the client', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetCamsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Nowhereville', date: '2026-07-26' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('treats a malformed (non-columnar) success body as an empty grid rather than throwing', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: null } });
    const handler = createGetCamsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-07-26' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(0);
  });

  it('defaults to the full coverage bbox when place and bbox are both omitted', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: EMPTY_CAMS_GRID } });
    const handler = createGetCamsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    await handler({ date: '2026-07-26' });

    expect(get).toHaveBeenCalledWith('/api/cams', { date: '2026-07-26', bbox: '89,1,114,30' });
    expect(resolve).not.toHaveBeenCalled();
  });
});
