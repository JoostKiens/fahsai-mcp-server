import { describe, expect, it, vi } from 'vitest';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { SMALL_STATION_READINGS } from '../logic/station-readings.fixtures.js';
import type { PlaceResolver, ResolvedPlace } from '../place-resolver/index.js';
import { createGetStationReadingsHandler } from './get-station-readings.js';

const CHIANG_MAI_BBOX = { west: 98.5, south: 18.3, east: 99.5, north: 19.3 };

function fakePlaceResolver(resolve: PlaceResolver['resolve']): PlaceResolver {
  return { resolve };
}

function fakeResolvedPlace(overrides: Partial<ResolvedPlace> = {}): ResolvedPlace {
  return {
    query: 'Chiang Mai',
    matchedName: 'Chiang Mai, Thailand',
    lat: 18.7883,
    lng: 98.9853,
    bbox: CHIANG_MAI_BBOX,
    outsideCoverage: false,
    otherMatchesCount: 0,
    ...overrides,
  };
}

function fakeClient(get: FahsaiClient['get']): FahsaiClient {
  return { get };
}

describe('createGetStationReadingsHandler', () => {
  it('resolves the place, fetches, and summarizes on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_STATION_READINGS } });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-07-25' });

    expect(get).toHaveBeenCalledWith('/api/station-readings/latest', {
      bbox: '98.5,18.3,99.5,19.3',
      date: '2026-07-25',
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(4);
  });

  it('does not send a `parameter` query param (it is a no-op on the live API)', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    await handler({ place: 'Chiang Mai' });

    const [, params] = get.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty('parameter');
  });

  it('treats a 404 as "no data available" rather than an error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No station readings for this date.' },
    });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2099-01-01' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No station readings available for 2099-01-01.');
  });

  it('uses a location-only no-data note when no date was given', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No station readings for this date.' },
    });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai' });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe('No station readings currently available for this location.');
  });

  it('treats a 200 with an empty data array the same as a 404 (defensive)', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-07-25' });

    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No station readings available for 2026-07-25.');
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai' });

    expect(result.isError).toBe(true);
  });

  it('returns isError when location resolution fails', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Nowhereville' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('surfaces the location-resolution note (e.g. bbox overriding place) in the response', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });
    const bbox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await handler({ place: 'Chiang Mai', bbox, date: '2026-07-25' });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe(
      '`place` was ignored because `bbox` was provided directly. No station readings available for 2026-07-25.',
    );
    expect(resolve).not.toHaveBeenCalled();
  });
});
