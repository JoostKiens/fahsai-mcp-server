import { describe, expect, it, vi } from 'vitest';

import { CHIANG_MAI_BBOX, fakePlaceResolver, fakeResolvedPlace } from '../place-resolver/place-resolver.fixtures.js';
import { createGeocodePlaceHandler } from './geocode-place.js';

describe('createGeocodePlaceHandler', () => {
  it('resolves a place to coordinates and a bbox on the happy path', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const handler = createGeocodePlaceHandler({ placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Chiang Mai' });

    expect(resolve).toHaveBeenCalledWith('Chiang Mai', { radiusKm: undefined });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as {
      matchedName: string;
      lat: number;
      lng: number;
      bbox: unknown;
      note?: string;
    };
    expect(structured.matchedName).toBe('Chiang Mai, Thailand');
    expect(structured.lat).toBe(18.7883);
    expect(structured.bbox).toEqual(CHIANG_MAI_BBOX);
    expect(structured.note).toBeUndefined();
  });

  it('notes when the match was ambiguous', async () => {
    const resolve = vi.fn().mockResolvedValue({
      ok: true,
      value: fakeResolvedPlace({ query: 'Springfield', matchedName: 'Springfield, Illinois, USA', otherMatchesCount: 1 }),
    });
    const handler = createGeocodePlaceHandler({ placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Springfield' });

    const structured = result.structuredContent as { note?: string };
    expect(structured.note).toContain('1 other match(es)');
  });

  it('returns isError when the place cannot be found', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const handler = createGeocodePlaceHandler({ placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'asdkjfhaklsdjfh' });

    expect(result.isError).toBe(true);
  });

  it('returns isError with the place name when resolved outside Fahsai coverage', async () => {
    const resolve = vi.fn().mockResolvedValue({
      ok: true,
      value: fakeResolvedPlace({ matchedName: 'Paris, France', bbox: null, outsideCoverage: true }),
    });
    const handler = createGeocodePlaceHandler({ placeResolver: fakePlaceResolver(resolve) });

    const result = await handler({ place: 'Paris' });

    expect(result.isError).toBe(true);
    const [block] = result.content;
    expect(block?.type === 'text' ? block.text : '').toContain('Paris');
  });

  it('passes a custom radius_km through to the resolver', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const handler = createGeocodePlaceHandler({ placeResolver: fakePlaceResolver(resolve) });

    await handler({ place: 'Chiang Mai', radius_km: 200 });

    expect(resolve).toHaveBeenCalledWith('Chiang Mai', { radiusKm: 200 });
  });
});
