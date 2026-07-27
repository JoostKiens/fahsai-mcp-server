import { describe, expect, it } from 'vitest';

import { createNominatimClient } from './nominatim-client.js';

describe('Nominatim search (live)', () => {
  it('resolves a well-known place to a correctly-shaped match', async () => {
    const client = createNominatimClient();

    const result = await client.search('Bangkok');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(result.value.length).toBeGreaterThan(0);
    const [top] = result.value;
    expect(Number.isFinite(Number(top.lat))).toBe(true);
    expect(Number.isFinite(Number(top.lon))).toBe(true);
    expect(typeof top.display_name).toBe('string');
  });
});
