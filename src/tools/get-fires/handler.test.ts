import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import { SMALL_FIRES } from '../../shared/fires/handler.fixtures.js';
import {
  fakePlaceResolver,
  fakeResolvedPlace,
} from '../../shared/place-resolver/place-resolver.fixtures.js';
import { createGetFiresHandler } from './handler.js';

describe('createGetFiresHandler', () => {
  it('resolves the place, fetches, and summarizes on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_FIRES } });
    const handler = createGetFiresHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18' });

    expect(get).toHaveBeenCalledWith('/api/fires', {
      date: '2026-04-18',
      bbox: '98.5,18.3,99.5,19.3',
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(4);
  });

  it('filters results by confidence client-side (the API param has no server-side effect)', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_FIRES } });
    const handler = createGetFiresHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2026-04-18', confidence: ['high'] });

    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(1);
  });

  it('treats a 404 as "not ingested yet" rather than an error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetFiresHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai', date: '2099-01-01' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No fire data ingested for 2099-01-01 yet.');
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetFiresHandler({
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
    const handler = createGetFiresHandler({
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
    const handler = createGetFiresHandler({
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
    const handler = createGetFiresHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });
    const bbox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await handler({ place: 'Chiang Mai', bbox, date: '2099-01-01' });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toBe(
      '`place` was ignored because `bbox` was provided directly. No fire data ingested for 2099-01-01 yet.',
    );
  });
});
