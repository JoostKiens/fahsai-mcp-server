import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../fahsai-client/client.js';
import type { StationsApiResponse } from '../logic/stations.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

describe('/api/stations (live)', () => {
  it('returns { data } wrapped stations matching the documented shape', async () => {
    const client = createFahsaiClient();

    const result = await client.get<StationsApiResponse>('/api/stations', { bbox: SMALL_BBOX });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(Array.isArray(result.value.data)).toBe(true);
    expect(result.value.data.length).toBeGreaterThan(0);

    for (const station of result.value.data) {
      expect(typeof station.id).toBe('string');
      expect(typeof station.name).toBe('string');
      expect(typeof station.lat).toBe('number');
      expect(typeof station.lng).toBe('number');
      expect(typeof station.country).toBe('string');
      expect(station.provider === null || typeof station.provider === 'string').toBe(true);
      expect(station).not.toHaveProperty('isMobile');
      expect(station).not.toHaveProperty('isMonitor');
      expect(station).not.toHaveProperty('parameters');
    }
  });
});
