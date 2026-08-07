import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import {
  EMPTY_STATION_READINGS,
  STATIONS_BY_DISTANCE,
} from '../../shared/nearest-station/handler.fixtures.js';
import { fakePlaceResolver, fakeResolvedPlace } from '../../shared/place-resolver/place-resolver.fixtures.js';
import { fakeOutlierHighScientificContext, fakeScientificContext } from './handler.fixtures.js';
import { createGetReadingExplanationHandler } from './handler.js';

// Matches the bbox STATIONS_BY_DISTANCE's fixture distances were computed against — 'near' wins.
const CHIANG_MAI_BBOX = { west: 98.5, south: 18.3, east: 99.5, north: 19.3 };
const DATE = '2026-07-25';

function pathBasedGet(handlers: Record<string, unknown>) {
  return vi.fn().mockImplementation((path: string) => {
    if (!(path in handlers)) throw new Error(`Unexpected path: ${path}`);
    return handlers[path];
  });
}

describe('createGetReadingExplanationHandler', () => {
  it('resolves the nearest station and returns the ScientificContext response on the happy path', async () => {
    const get = pathBasedGet({
      '/api/station-readings/latest': { ok: true, value: { data: STATIONS_BY_DISTANCE } },
      '/api/explain/context': { ok: true, value: fakeScientificContext() },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(get).toHaveBeenCalledWith('/api/station-readings/latest', {
      bbox: '98.5,18.3,99.5,19.3',
      date: DATE,
    });
    expect(get).toHaveBeenCalledWith('/api/explain/context', {
      stationId: 'near',
      lat: 18.81,
      lng: 99.01,
      date: DATE,
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { explainCase: string; currentPm25: number };
    expect(structured.explainCase).toBe('PLAUSIBLE_CLEAN');
    expect(structured.currentPm25).toBe(21.3);
  });

  it('returns the OUTLIER_HIGH shape unmodified (transport null, outlier populated) on the happy path', async () => {
    const get = pathBasedGet({
      '/api/station-readings/latest': { ok: true, value: { data: STATIONS_BY_DISTANCE } },
      '/api/explain/context': { ok: true, value: fakeOutlierHighScientificContext() },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ bbox: CHIANG_MAI_BBOX, date: DATE });

    const structured = result.structuredContent as {
      explainCase: string;
      transport: unknown;
      outlier: unknown;
    };
    expect(structured.explainCase).toBe('OUTLIER_HIGH');
    expect(structured.transport).toBeNull();
    expect(structured.outlier).toEqual({ type: 'HIGH', ratio: 5.445463385958721, peerTier: 1 });
  });

  it('returns a note-only response, no ScientificContext fields, when no station is nearby', async () => {
    const get = pathBasedGet({
      '/api/station-readings/latest': { ok: true, value: { data: EMPTY_STATION_READINGS } },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ note: 'No stations found within the search area.' });
  });

  it('returns a note-only response, no ScientificContext fields, when the station has no reading for the requested date', async () => {
    const get = pathBasedGet({
      '/api/station-readings/latest': { ok: true, value: { data: STATIONS_BY_DISTANCE } },
      '/api/explain/context': {
        ok: false,
        error: { kind: 'not-found', status: 404, message: 'No reading for this date.' },
      },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      note: `No reading explanation available for station near on ${DATE}.`,
    });
  });

  it('returns isError for a non-404 FahsaiError from the nearest-station lookup', async () => {
    const get = pathBasedGet({
      '/api/station-readings/latest': {
        ok: false,
        error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
      },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.isError).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns isError for a non-404 FahsaiError from the explain/context call', async () => {
    const get = pathBasedGet({
      '/api/station-readings/latest': { ok: true, value: { data: STATIONS_BY_DISTANCE } },
      '/api/explain/context': {
        ok: false,
        error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
      },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ bbox: CHIANG_MAI_BBOX, date: DATE });

    expect(result.isError).toBe(true);
  });

  it('returns isError when location resolution fails, without calling the client', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Nowhereville' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('fetches /api/latest-date first when no date is given, and reuses that date for both the nearest-station lookup and the explain/context call', async () => {
    const get = pathBasedGet({
      '/api/latest-date': { ok: true, value: { date: DATE } },
      '/api/station-readings/latest': { ok: true, value: { data: STATIONS_BY_DISTANCE } },
      '/api/explain/context': { ok: true, value: fakeScientificContext({ date: DATE }) },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    await handler({ bbox: CHIANG_MAI_BBOX });

    expect(get).toHaveBeenNthCalledWith(1, '/api/latest-date');
    expect(get).toHaveBeenNthCalledWith(2, '/api/station-readings/latest', {
      bbox: '98.5,18.3,99.5,19.3',
      date: DATE,
    });
    expect(get).toHaveBeenNthCalledWith(3, '/api/explain/context', {
      stationId: 'near',
      lat: 18.81,
      lng: 99.01,
      date: DATE,
    });
  });

  it('returns isError when /api/latest-date itself fails', async () => {
    const get = pathBasedGet({
      '/api/latest-date': { ok: false, error: { kind: 'network', message: 'timeout' } },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ bbox: CHIANG_MAI_BBOX });

    expect(result.isError).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('surfaces the location-resolution note (e.g. bbox overriding place) alongside a successful response', async () => {
    const get = pathBasedGet({
      '/api/station-readings/latest': { ok: true, value: { data: STATIONS_BY_DISTANCE } },
      '/api/explain/context': { ok: true, value: fakeScientificContext() },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(vi.fn()),
    });

    const result = await handler({ place: 'Chiang Mai', bbox: CHIANG_MAI_BBOX, date: DATE });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe('`place` was ignored because `bbox` was provided directly.');
  });

  it('resolves a place via the place resolver when no bbox is given', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = pathBasedGet({
      '/api/station-readings/latest': { ok: true, value: { data: STATIONS_BY_DISTANCE } },
      '/api/explain/context': { ok: true, value: fakeScientificContext() },
    });
    const handler = createGetReadingExplanationHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: DATE });

    expect(resolve).toHaveBeenCalledWith('Chiang Mai', { radiusKm: undefined });
    expect(result.isError).toBeUndefined();
  });
});
