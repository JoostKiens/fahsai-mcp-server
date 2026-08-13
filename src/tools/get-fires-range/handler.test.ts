import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import { SMALL_FIRES } from '../../shared/fires/handler.fixtures.js';
import {
  fakePlaceResolver,
  fakeResolvedPlace,
} from '../../shared/place-resolver/place-resolver.fixtures.js';
import { createGetFiresRangeHandler } from './handler.js';

describe('createGetFiresRangeHandler', () => {
  it('resolves, fetches the range endpoint, and summarizes on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_FIRES } });
    const handler = createGetFiresRangeHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', start: '2026-04-01', end: '2026-04-05' });

    expect(get).toHaveBeenCalledWith('/api/fires/range', {
      start: '2026-04-01',
      end: '2026-04-05',
      bbox: '98.5,18.3,99.5,19.3',
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(4);
  });

  it('filters results by confidence client-side (the API param has no server-side effect)', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_FIRES } });
    const handler = createGetFiresRangeHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({
      place: 'Chiang Mai',
      start: '2026-04-01',
      end: '2026-04-05',
      confidence: ['high'],
    });

    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(1);
  });

  it('rejects an 11-day range without ever calling the client', async () => {
    const resolve = vi.fn();
    const get = vi.fn();
    const handler = createGetFiresRangeHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', start: '2026-04-01', end: '2026-04-12' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects an invalid calendar date (e.g. Feb 30) without ever calling the client', async () => {
    const resolve = vi.fn();
    const get = vi.fn();
    const handler = createGetFiresRangeHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', start: '2026-02-25', end: '2026-02-30' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('returns isError when location resolution fails', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetFiresRangeHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Nowhereville', start: '2026-04-01', end: '2026-04-05' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('treats a 404 as "not ingested yet" rather than an error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetFiresRangeHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', start: '2099-01-01', end: '2099-01-05' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No fire data ingested for 2099-01-01–2099-01-05 yet.');
  });

  it('combines the location-resolution note with the not-ingested-yet note on a 404', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetFiresRangeHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });
    const bbox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await handler({
      place: 'Chiang Mai',
      bbox,
      start: '2099-01-01',
      end: '2099-01-05',
    });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe(
      '`place` was ignored because `bbox` was provided directly. No fire data ingested for 2099-01-01–2099-01-05 yet.',
    );
  });
});
