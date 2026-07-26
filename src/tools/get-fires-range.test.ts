import { describe, expect, it, vi } from 'vitest';

import type { FahsaiClient } from '../fahsai-client/client.js';
import type { PlaceResolver, ResolvedPlace } from '../place-resolver/index.js';
import { SMALL_FIRES } from './fires.fixtures.js';
import { createGetFiresRangeHandler, validateFiresRange } from './get-fires-range.js';

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

describe('validateFiresRange', () => {
  it('accepts a range exactly at the 10-day cap', () => {
    expect(validateFiresRange('2026-04-01', '2026-04-11')).toEqual({ ok: true, value: undefined });
  });

  it('rejects a range one day over the cap', () => {
    const result = validateFiresRange('2026-04-01', '2026-04-12');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toContain('maximum of 10 days');
  });

  it('rejects end before start', () => {
    const result = validateFiresRange('2026-04-10', '2026-04-05');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toBe('`end` must not be before `start`.');
  });

  it('accepts a single-day range (start === end)', () => {
    expect(validateFiresRange('2026-04-01', '2026-04-01')).toEqual({ ok: true, value: undefined });
  });
});

describe('createGetFiresRangeHandler', () => {
  it('resolves, fetches the range endpoint, and summarizes on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({ ok: true, value: SMALL_FIRES });
    const handler = createGetFiresRangeHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai', start: '2026-04-01', end: '2026-04-05' });

    expect(get).toHaveBeenCalledWith('/api/fires/range', {
      start: '2026-04-01',
      end: '2026-04-05',
      bbox: '98.5,18.3,99.5,19.3',
      confidence: undefined,
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(4);
  });

  it('rejects an 11-day range without ever calling the client', async () => {
    const resolve = vi.fn();
    const get = vi.fn();
    const handler = createGetFiresRangeHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai', start: '2026-04-01', end: '2026-04-12' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('treats a 404 as "not ingested yet" rather than an error', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetFiresRangeHandler({ client: fakeClient(get), placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai', start: '2099-01-01', end: '2099-01-05' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No fire data ingested for 2099-01-01–2099-01-05 yet.');
  });
});
