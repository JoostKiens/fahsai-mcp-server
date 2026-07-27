import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import { fakePlaceResolver, fakeResolvedPlace } from '../../shared/place-resolver/place-resolver.fixtures.js';
import { createGetStationsHandler } from './handler.js';
import { EMPTY_STATIONS, SMALL_STATIONS } from './handler.fixtures.js';

describe('createGetStationsHandler', () => {
  it('resolves the place, fetches, and returns the full station list unsummarized', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_STATIONS } });
    const handler = createGetStationsHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai' });

    expect(get).toHaveBeenCalledWith('/api/stations', { bbox: '98.5,18.3,99.5,19.3' });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; stations: unknown[] };
    expect(structured.total).toBe(3);
    expect(structured.stations).toEqual(SMALL_STATIONS);
  });

  it('returns an empty list for a bbox with no stations', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: EMPTY_STATIONS } });
    const handler = createGetStationsHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai' });

    const structured = result.structuredContent as { total: number; stations: unknown[] };
    expect(structured.total).toBe(0);
    expect(structured.stations).toEqual([]);
  });

  it('treats a malformed (non-object) success body as an empty list rather than throwing', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: null });
    const handler = createGetStationsHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; stations: unknown[] };
    expect(structured.total).toBe(0);
    expect(structured.stations).toEqual([]);
  });

  it('returns isError when location resolution fails', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetStationsHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Nowhereville' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetStationsHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai' });

    expect(result.isError).toBe(true);
  });

  it('surfaces the location-resolution note (e.g. bbox overriding place) in the response', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: EMPTY_STATIONS } });
    const handler = createGetStationsHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });
    const bbox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await handler({ place: 'Chiang Mai', bbox });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe('`place` was ignored because `bbox` was provided directly.');
    expect(resolve).not.toHaveBeenCalled();
  });
});
