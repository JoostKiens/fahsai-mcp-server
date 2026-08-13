import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import {
  fakePlaceResolver,
  fakeResolvedPlace,
} from '../../shared/place-resolver/place-resolver.fixtures.js';
import {
  EMPTY_WEATHER_POINTS,
  fakeWeatherPoint,
  LARGE_WEATHER_GRID,
  MALFORMED_WIND_POINT,
  TWO_CELL_POINTS,
  TWO_POINTS_SAME_DIRECTION,
} from './handler.fixtures.js';
import {
  aggregateWeatherPoints,
  createGetWeatherHandler,
  emptyWeatherSummary,
  summarizeWeather,
  WEATHER_RAW_POINTS_MAX,
} from './handler.js';
import { getWeatherInputSchema } from './schema.js';

describe('aggregateWeatherPoints', () => {
  it('vector-averages same-direction wind readings to the arithmetic mean speed/direction', () => {
    const aggregate = aggregateWeatherPoints(TWO_POINTS_SAME_DIRECTION);

    expect(aggregate.pointCount).toBe(2);
    expect(aggregate.windSpeedKmh).toBeCloseTo(15); // mean of 10 and 20
    expect(aggregate.wind?.fromLabel).toBe('E');
    expect(aggregate.wind?.toLabel).toBe('W');
    expect(aggregate.precipitationSumMm).toBeCloseTo(2); // mean of 1 and 3
    expect(aggregate.relativeHumidity2m).toBeCloseTo(70); // mean of 60 and 80
    expect(aggregate.lat).toBeCloseTo(11); // mean of 10 and 12
    expect(aggregate.lng).toBeCloseTo(101); // mean of 100 and 102
  });

  it('returns an all-null aggregate for an empty input, without dividing by zero', () => {
    const aggregate = aggregateWeatherPoints(EMPTY_WEATHER_POINTS);

    expect(aggregate.pointCount).toBe(0);
    expect(aggregate.windSpeedKmh).toBeNull();
    expect(aggregate.wind).toBeNull();
    expect(aggregate.precipitationSumMm).toBeNull();
    expect(aggregate.relativeHumidity2m).toBeNull();
  });

  it('degrades to a null wind/windSpeedKmh (never throws) when a point has a non-finite wind_direction_deg', () => {
    const points = [fakeWeatherPoint(), MALFORMED_WIND_POINT];

    expect(() => aggregateWeatherPoints(points)).not.toThrow();
    const aggregate = aggregateWeatherPoints(points);
    expect(aggregate.wind).toBeNull();
    expect(aggregate.windSpeedKmh).toBeNull();
    // Fields independent of the wind computation are unaffected.
    expect(aggregate.pointCount).toBe(2);
  });
});

describe('summarizeWeather', () => {
  it('bins points into separate cells when they fall in different regions', () => {
    const summary = summarizeWeather(TWO_CELL_POINTS, false);

    expect(summary.total).toBe(4);
    expect(summary.cells.length).toBeGreaterThanOrEqual(2);
    const totalBinned = summary.cells.reduce((sum, cell) => sum + cell.pointCount, 0);
    expect(totalBinned).toBe(4);
  });

  it('omits rawPoints by default', () => {
    const summary = summarizeWeather(TWO_CELL_POINTS, false);
    expect(summary.rawPoints).toBeUndefined();
  });

  it('includes individually wind-formatted rawPoints when requested', () => {
    const summary = summarizeWeather(TWO_CELL_POINTS, true);

    expect(summary.rawPoints).toHaveLength(4);
    expect(summary.rawPointsTruncated).toBe(false);
    expect(summary.rawPoints?.[0].wind?.fromLabel).toBeDefined();
  });

  it('surfaces a null wind (never throws) for a raw point with a non-finite wind_direction_deg', () => {
    const points = [MALFORMED_WIND_POINT];

    expect(() => summarizeWeather(points, true)).not.toThrow();
    const summary = summarizeWeather(points, true);
    expect(summary.rawPoints?.[0].wind).toBeNull();
  });

  it('stride-samples and truncates rawPoints above the cap, with a note', () => {
    const summary = summarizeWeather(LARGE_WEATHER_GRID, true);

    expect(summary.total).toBe(1200);
    expect(summary.rawPoints).toHaveLength(WEATHER_RAW_POINTS_MAX);
    expect(summary.rawPointsTruncated).toBe(true);
    expect(summary.note).toContain(`${WEATHER_RAW_POINTS_MAX} of 1200`);
  });
});

describe('emptyWeatherSummary', () => {
  it('represents "no data" with zero points and a null aggregate', () => {
    const summary = emptyWeatherSummary();

    expect(summary.total).toBe(0);
    expect(summary.cells).toEqual([]);
    expect(summary.summary.pointCount).toBe(0);
  });
});

describe('createGetWeatherHandler', () => {
  it('resolves the place, fetches, and summarizes on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: TWO_POINTS_SAME_DIRECTION } });
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18' });

    expect(get).toHaveBeenCalledWith('/api/weather', {
      date: '2026-04-18',
      bbox: '98.5,18.3,99.5,19.3',
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      total: number;
      summary: { windSpeedKmh: number };
    };
    expect(structured.total).toBe(2);
    expect(structured.summary.windSpeedKmh).toBeCloseTo(15);
  });

  it('treats a 404 as "not ingested yet" rather than an error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2099-01-01' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No weather data ingested for 2099-01-01 yet.');
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18' });

    expect(result.isError).toBe(true);
  });

  it('returns isError when location resolution fails', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Nowhereville', date: '2026-04-18' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('surfaces the location-resolution note (e.g. bbox overriding place) in the response', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });
    const bbox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await handler({ place: 'Chiang Mai', bbox, date: '2026-04-18' });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe('`place` was ignored because `bbox` was provided directly.');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('combines the location-resolution note with the not-ingested-yet note on a 404', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });
    const bbox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await handler({ place: 'Chiang Mai', bbox, date: '2099-01-01' });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe(
      '`place` was ignored because `bbox` was provided directly. No weather data ingested for 2099-01-01 yet.',
    );
  });

  it('passes include_raw_points through to the summary', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: TWO_POINTS_SAME_DIRECTION } });
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({
      place: 'Chiang Mai',
      date: '2026-04-18',
      include_raw_points: true,
    });

    const structured = result.structuredContent as { rawPoints?: unknown[] };
    expect(structured.rawPoints).toHaveLength(2);
  });

  it('treats a malformed (non-object) success body as an empty result rather than throwing', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: null });
    const handler = createGetWeatherHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; cells: unknown[] };
    expect(structured.total).toBe(0);
    expect(structured.cells).toEqual([]);
  });

  it('rejects a missing date at the schema level', () => {
    const parsed = getWeatherInputSchema.safeParse({ place: 'Chiang Mai' });
    expect(parsed.success).toBe(false);
  });
});
