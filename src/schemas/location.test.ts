import { describe, expect, it, vi } from 'vitest';

import { FAHSAI_DATA_BBOX, type BoundingBox } from '../logic/bbox.js';
import type { PlaceResolver, ResolvedPlace } from '../place-resolver/index.js';
import { resolveLocationInput } from './location.js';

const CHIANG_MAI_BBOX: BoundingBox = { west: 98.5, south: 18.3, east: 99.5, north: 19.3 };

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

function fakePlaceResolver(resolve: PlaceResolver['resolve']): PlaceResolver {
  return { resolve };
}

describe('resolveLocationInput', () => {
  it('resolves place-only input via the place resolver', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const placeResolver = fakePlaceResolver(resolve);

    const result = await resolveLocationInput({ place: 'Chiang Mai' }, placeResolver);

    expect(result).toEqual({ ok: true, value: { bbox: CHIANG_MAI_BBOX } });
    expect(resolve).toHaveBeenCalledWith('Chiang Mai', { radiusKm: undefined });
  });

  it('passes bbox-only input through verbatim without calling the place resolver', async () => {
    const resolve = vi.fn();
    const placeResolver = fakePlaceResolver(resolve);
    const bbox: BoundingBox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await resolveLocationInput({ bbox }, placeResolver);

    expect(result).toEqual({ ok: true, value: { bbox, note: undefined } });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('lets bbox win when both place and bbox are given, with a note that place was ignored', async () => {
    const resolve = vi.fn();
    const placeResolver = fakePlaceResolver(resolve);
    const bbox: BoundingBox = { west: 100, south: 13, east: 101, north: 14 };

    const result = await resolveLocationInput({ place: 'Chiang Mai', bbox }, placeResolver);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.bbox).toEqual(bbox);
    expect(result.value.note).toBe('`place` was ignored because `bbox` was provided directly.');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('falls back to the default SEA bbox when neither place nor bbox is given', async () => {
    const resolve = vi.fn();
    const placeResolver = fakePlaceResolver(resolve);

    const result = await resolveLocationInput({}, placeResolver);

    expect(result).toEqual({ ok: true, value: { bbox: FAHSAI_DATA_BBOX } });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('reports outside-coverage when the resolved place has no bbox', async () => {
    const resolve = vi.fn().mockResolvedValue({
      ok: true,
      value: fakeResolvedPlace({ bbox: null, outsideCoverage: true }),
    });
    const placeResolver = fakePlaceResolver(resolve);

    const result = await resolveLocationInput({ place: 'Reykjavik' }, placeResolver);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error).toEqual({
      kind: 'outside-coverage',
      message: `"Reykjavik" is outside Fahsai's coverage area.`,
    });
  });

  it('propagates a place resolver error unchanged', async () => {
    const resolverError = { ok: false, error: { kind: 'not-found' as const, message: 'No match found' } };
    const resolve = vi.fn().mockResolvedValue(resolverError);
    const placeResolver = fakePlaceResolver(resolve);

    const result = await resolveLocationInput({ place: 'Nowhereville' }, placeResolver);

    expect(result).toEqual(resolverError);
  });
});
