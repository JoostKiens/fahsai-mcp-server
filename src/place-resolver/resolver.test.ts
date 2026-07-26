import { describe, expect, it, vi } from 'vitest';

import type { NominatimClient } from './nominatim-client.js';
import { createPlaceResolver } from './resolver.js';

function fakeNominatimClient(searchImpl: NominatimClient['search']): NominatimClient {
  return { search: searchImpl };
}

describe('createPlaceResolver', () => {
  it('resolves a single match to lat/lng and a clamped bbox', async () => {
    const search = vi
      .fn()
      .mockResolvedValue({ ok: true, value: [{ lat: '18.7883', lon: '98.9853', display_name: 'Chiang Mai, Thailand' }] });
    const resolver = createPlaceResolver({ nominatimClient: fakeNominatimClient(search) });

    const result = await resolver.resolve('Chiang Mai');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.matchedName).toBe('Chiang Mai, Thailand');
    expect(result.value.lat).toBeCloseTo(18.7883, 4);
    expect(result.value.lng).toBeCloseTo(98.9853, 4);
    expect(result.value.outsideCoverage).toBe(false);
    expect(result.value.otherMatchesCount).toBe(0);
    expect(result.value.bbox).not.toBeNull();
  });

  it('caches a resolved point so a repeat query does not call Nominatim again', async () => {
    const search = vi
      .fn()
      .mockResolvedValue({ ok: true, value: [{ lat: '13.7563', lon: '100.5018', display_name: 'Bangkok, Thailand' }] });
    const resolver = createPlaceResolver({ nominatimClient: fakeNominatimClient(search) });

    await resolver.resolve('Bangkok');
    await resolver.resolve('bangkok');

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('reports other matches when the query is ambiguous', async () => {
    const search = vi.fn().mockResolvedValue({
      ok: true,
      value: [
        { lat: '39.7817', lon: '-89.6501', display_name: 'Springfield, Illinois, USA' },
        { lat: '42.1015', lon: '-72.5898', display_name: 'Springfield, Massachusetts, USA' },
      ],
    });
    const resolver = createPlaceResolver({ nominatimClient: fakeNominatimClient(search) });

    const result = await resolver.resolve('Springfield');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.otherMatchesCount).toBe(1);
  });

  it('returns a not-found error when Nominatim has no match', async () => {
    const search = vi.fn().mockResolvedValue({ ok: true, value: [] });
    const resolver = createPlaceResolver({ nominatimClient: fakeNominatimClient(search) });

    const result = await resolver.resolve('asdkjfhaklsdjfh');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error result');
    expect(result.error.kind).toBe('not-found');
  });

  it('marks a resolved place outside SEA as outsideCoverage with a null bbox', async () => {
    const search = vi
      .fn()
      .mockResolvedValue({ ok: true, value: [{ lat: '48.8566', lon: '2.3522', display_name: 'Paris, France' }] });
    const resolver = createPlaceResolver({ nominatimClient: fakeNominatimClient(search) });

    const result = await resolver.resolve('Paris');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value.outsideCoverage).toBe(true);
    expect(result.value.bbox).toBeNull();
  });

  it('passes through a Nominatim client error', async () => {
    const search = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'network', message: 'boom' } });
    const resolver = createPlaceResolver({ nominatimClient: fakeNominatimClient(search) });

    const result = await resolver.resolve('Bangkok');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error result');
    expect(result.error).toEqual({ kind: 'network', message: 'boom' });
  });

  it('uses an overridden radius_km instead of the default', async () => {
    const search = vi
      .fn()
      .mockResolvedValue({ ok: true, value: [{ lat: '13.7563', lon: '100.5018', display_name: 'Bangkok, Thailand' }] });
    const resolver = createPlaceResolver({ nominatimClient: fakeNominatimClient(search) });

    const wide = await resolver.resolve('Bangkok', { radiusKm: 200 });
    if (!wide.ok || !wide.value.bbox) throw new Error('Expected a bbox');
    const narrow = await resolver.resolve('Bangkok', { radiusKm: 10 });
    if (!narrow.ok || !narrow.value.bbox) throw new Error('Expected a bbox');

    const wideWidth = wide.value.bbox.east - wide.value.bbox.west;
    const narrowWidth = narrow.value.bbox.east - narrow.value.bbox.west;
    expect(wideWidth).toBeGreaterThan(narrowWidth);
  });
});
