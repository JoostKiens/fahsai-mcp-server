import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../fahsai-client/client.fixtures.js';
import { TWO_POINTS_SAME_DIRECTION } from '../logic/weather.fixtures.js';
import { fakePlaceResolver, fakeResolvedPlace } from '../place-resolver/place-resolver.fixtures.js';
import { createGetWeatherHandler, getWeatherInputSchema } from './get-weather.js';

describe('createGetWeatherHandler', () => {
  it('resolves the place, fetches, and summarizes on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: TWO_POINTS_SAME_DIRECTION } });
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18' });

    expect(get).toHaveBeenCalledWith('/api/weather', {
      date: '2026-04-18',
      bbox: '98.5,18.3,99.5,19.3',
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; summary: { windSpeedKmh: number } };
    expect(structured.total).toBe(2);
    expect(structured.summary.windSpeedKmh).toBeCloseTo(15);
  });

  it('treats a 404 as "not ingested yet" rather than an error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

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
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18' });

    expect(result.isError).toBe(true);
  });

  it('returns isError when location resolution fails', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Nowhereville', date: '2026-04-18' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('surfaces the location-resolution note (e.g. bbox overriding place) in the response', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });
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
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });
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
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18', include_raw_points: true });

    const structured = result.structuredContent as { rawPoints?: unknown[] };
    expect(structured.rawPoints).toHaveLength(2);
  });

  it('treats a malformed (non-object) success body as an empty result rather than throwing', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: null });
    const handler = createGetWeatherHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

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
