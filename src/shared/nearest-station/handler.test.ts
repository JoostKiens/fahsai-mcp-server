import { describe, expect, it, vi } from 'vitest';

import type { BoundingBox } from '../bbox.js';
import { fakeClient } from '../fahsai-client/client.fixtures.js';
import {
  EMPTY_STATION_READINGS,
  STATIONS_ALL_BEYOND_CUTOFF,
  STATIONS_BY_DISTANCE,
  STATIONS_MIXED_DATES,
} from './handler.fixtures.js';
import { findNearestStation } from './handler.js';

const CHIANG_MAI_BBOX: BoundingBox = { west: 98.5, south: 18.3, east: 99.5, north: 19.3 };
const DATE = '2026-07-25';

describe('findNearestStation', () => {
  it('picks the closest station to the bbox center', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: STATIONS_BY_DISTANCE } });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.stationId).toBe('near');
    expect(get).toHaveBeenCalledWith('/api/station-readings/latest', {
      bbox: '98.5,18.3,99.5,19.3',
      date: DATE,
    });
  });

  it('returns no-nearby-station when the nearest candidate exceeds the 50km cutoff', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { data: STATIONS_ALL_BEYOND_CUTOFF } });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toEqual({
      kind: 'no-nearby-station',
      message: 'Nearest station is more than 50km from the requested location.',
    });
  });

  it('returns no-nearby-station on a 404 (no stations in the bbox)', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No station readings for this date.' },
    });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toEqual({
      kind: 'no-nearby-station',
      message: 'No stations found within the search area.',
    });
  });

  it('returns no-nearby-station on a 200 with an empty data array', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: EMPTY_STATION_READINGS } });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toEqual({
      kind: 'no-nearby-station',
      message: 'No stations found within the search area.',
    });
  });

  it('treats a malformed (non-array) data field as no candidates instead of throwing', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: null } });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toEqual({
      kind: 'no-nearby-station',
      message: 'No stations found within the search area.',
    });
  });

  it('skips a closer station with no reading for the requested date, in favor of the next-closest one that has one', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: STATIONS_MIXED_DATES } });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.stationId).toBe('near');
  });

  it('returns no-nearby-station when no candidate has a reading for the requested date', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: STATIONS_MIXED_DATES } });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: '2026-07-24' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.stationId).toBe('wrong-date');

    const emptyResult = await findNearestStation(client, {
      bbox: CHIANG_MAI_BBOX,
      date: '2099-01-01',
    });
    expect(emptyResult).toEqual({
      ok: false,
      error: { kind: 'no-nearby-station', message: 'No station has a reading for 2099-01-01.' },
    });
  });

  it('fetches /api/latest-date first when no date is given, and uses it for both the station-readings call and date-filtering', async () => {
    const get = vi.fn().mockImplementation((path: string) => {
      if (path === '/api/latest-date') {
        return { ok: true, value: { date: DATE } };
      }
      return { ok: true, value: { data: STATIONS_BY_DISTANCE } };
    });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.stationId).toBe('near');
    expect(get).toHaveBeenNthCalledWith(1, '/api/latest-date');
    expect(get).toHaveBeenNthCalledWith(2, '/api/station-readings/latest', {
      bbox: '98.5,18.3,99.5,19.3',
      date: DATE,
    });
  });

  it('propagates a /api/latest-date failure unchanged, without wrapping it as no-nearby-station', async () => {
    const latestDateError = {
      ok: false,
      error: { kind: 'network' as const, message: 'Request to Fahsai API failed: timeout' },
    };
    const get = vi.fn().mockResolvedValue(latestDateError);
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX });

    expect(result).toEqual(latestDateError);
  });

  it('propagates a non-404 FahsaiError from the station-readings call unchanged', async () => {
    const serverError = {
      ok: false,
      error: { kind: 'server-error' as const, status: 500, message: 'Fahsai API server error' },
    };
    const get = vi.fn().mockResolvedValue(serverError);
    const client = fakeClient(get);

    const result = await findNearestStation(client, { bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result).toEqual(serverError);
  });

  it('returns a known stationId directly, with no distance calculation', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { id: 'known-station', lat: 13.36, lng: 100.98 } });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { stationId: 'known-station' });

    expect(result).toEqual({
      ok: true,
      value: { stationId: 'known-station', lat: 13.36, lng: 100.98 },
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/api/stations/known-station');
  });

  it('returns station-not-found for an unknown stationId, distinct from no-nearby-station', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'Station not found' },
    });
    const client = fakeClient(get);

    const result = await findNearestStation(client, { stationId: 'unknown-station' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error.kind).toBe('station-not-found');
    expect(result.error.kind).not.toBe('no-nearby-station');
  });

  it('propagates a non-404 FahsaiError from the single-station lookup unchanged', async () => {
    const serverError = {
      ok: false,
      error: { kind: 'server-error' as const, status: 500, message: 'Fahsai API server error' },
    };
    const get = vi.fn().mockResolvedValue(serverError);
    const client = fakeClient(get);

    const result = await findNearestStation(client, { stationId: 'known-station' });

    expect(result).toEqual(serverError);
  });
});
