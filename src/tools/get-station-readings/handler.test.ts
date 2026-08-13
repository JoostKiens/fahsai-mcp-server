import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import { fakePlaceResolver, fakeResolvedPlace } from '../../shared/place-resolver/place-resolver.fixtures.js';
import { createGetStationReadingsHandler, summarizeStationReadings } from './handler.js';
import {
  EMPTY_STATION_READINGS,
  SMALL_STATION_READINGS,
  STATION_READINGS_WITH_INVALID_VALUE,
} from './handler.fixtures.js';

describe('summarizeStationReadings', () => {
  it('returns total 0 and an empty readings array for no stations', () => {
    const summary = summarizeStationReadings(EMPTY_STATION_READINGS);
    expect(summary).toEqual({ total: 0, readings: [] });
  });

  it('maps every reading, attaching pm25 and aqiCategory per station', () => {
    const summary = summarizeStationReadings(SMALL_STATION_READINGS);

    expect(summary.total).toBe(4);
    expect(summary.readings).toHaveLength(4);
    expect(summary.readings[0]).toMatchObject({ stationId: '1', pm25: 5.33, aqiCategory: 'Good' });
    expect(summary.readings[1]).toMatchObject({
      stationId: '2',
      pm25: 20,
      aqiCategory: 'Moderate',
    });
    expect(summary.readings[2]).toMatchObject({
      stationId: '3',
      pm25: 45,
      aqiCategory: 'Unhealthy for Sensitive Groups',
    });
  });

  it('passes attribution through unchanged when present on the raw entry', () => {
    const summary = summarizeStationReadings(SMALL_STATION_READINGS);

    expect(summary.readings[3]?.attribution).toEqual({
      name: 'Example Provider',
      url: 'https://example.test/attribution',
    });
  });

  it('omits the attribution field entirely for stations that carry none', () => {
    const summary = summarizeStationReadings(SMALL_STATION_READINGS);

    expect(summary.readings[0]).not.toHaveProperty('attribution');
  });

  it('omits stations with an invalid pm25 value instead of throwing, with a note', () => {
    const summary = summarizeStationReadings(STATION_READINGS_WITH_INVALID_VALUE);

    expect(summary.total).toBe(2);
    expect(summary.readings.map((r) => r.stationId)).toEqual(['valid-1', 'valid-2']);
    expect(summary.note).toBe('2 station reading(s) omitted for an invalid PM2.5 value.');
  });

  it('has no note when every reading is valid', () => {
    const summary = summarizeStationReadings(SMALL_STATION_READINGS);

    expect(summary.note).toBeUndefined();
  });
});

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

    await handler({ place: 'Chiang Mai', date: '2026-07-25' });

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

  it('fetches /api/latest-date first when no date is given, and uses it in both the station-readings call and the no-data note', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/latest-date') {
        return { ok: true, value: { date: '2026-08-05' } };
      }
      return {
        ok: false,
        error: { kind: 'not-found', status: 404, message: 'No station readings for this date.' },
      };
    });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai' });

    expect(get).toHaveBeenNthCalledWith(1, '/api/latest-date');
    expect(get).toHaveBeenNthCalledWith(2, '/api/station-readings/latest', {
      bbox: '98.5,18.3,99.5,19.3',
      date: '2026-08-05',
    });
    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe('No station readings available for 2026-08-05.');
  });

  it('returns isError when /api/latest-date itself fails', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'network', message: 'Request to Fahsai API failed: timeout' },
    });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai' });

    expect(result.isError).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
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

  it('treats a malformed (non-array) data field as no data instead of throwing', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: null } });
    const handler = createGetStationReadingsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-07-25' });

    expect(result.isError).toBeUndefined();
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
