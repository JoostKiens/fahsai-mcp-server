import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { PowerPlantsApiResponse } from './handler.js';

describe('/api/power-plants (live)', () => {
  it('returns a bare FeatureCollection, not a { data: [...] }-wrapped response', async () => {
    const client = createFahsaiClient();

    const result = await client.get<PowerPlantsApiResponse>('/api/power-plants');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(result.value.type).toBe('FeatureCollection');
    expect(Array.isArray(result.value.features)).toBe(true);
    expect(result.value.features.length).toBeGreaterThan(0);

    const [feature] = result.value.features;
    expect(feature.type).toBe('Feature');
    expect(feature.geometry.type).toBe('Point');
    expect(feature.geometry.coordinates).toHaveLength(2);
    expect(typeof feature.properties.id).toBe('number');
    expect(typeof feature.properties.name).toBe('string');
    expect(typeof feature.properties.country).toBe('string');
    expect(['Coal', 'Gas', 'Oil']).toContain(feature.properties.fuel_type);
    expect(typeof feature.properties.capacity_mw).toBe('number');
  });
});
