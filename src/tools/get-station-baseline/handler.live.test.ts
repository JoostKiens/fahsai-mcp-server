import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { StationBaselineApiResponse } from './handler.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

// Only the field this test needs — importing the full type from ../get-stations/handler.js
// would cross the tool/tool module boundary eslint enforces (siblings can't reach into each
// other's folders; see eslint.config.cjs's no-restricted-paths).
interface StationLookupResponse {
  readonly data: readonly { readonly id: string }[];
}

describe('/api/stations/:id/baseline (live)', () => {
  it('returns { data, minYear, maxYear } for a real station id, matching the documented shape', async () => {
    const client = createFahsaiClient();

    // A bogus station_id doesn't 404 here either — it returns 200 with an empty `data` array —
    // so fetch a real id from /api/stations rather than hardcode one.
    const stations = await client.get<StationLookupResponse>('/api/stations', { bbox: SMALL_BBOX });
    expect(stations.ok).toBe(true);
    if (!stations.ok) throw new Error('Expected a successful response');
    expect(stations.value.data.length).toBeGreaterThan(0);
    const stationId = stations.value.data[0].id;

    const result = await client.get<StationBaselineApiResponse>(
      `/api/stations/${stationId}/baseline`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(Array.isArray(result.value.data)).toBe(true);
    expect(result.value.data.length).toBeLessThanOrEqual(365);
    expect(result.value.minYear === null || typeof result.value.minYear === 'number').toBe(true);
    expect(result.value.maxYear === null || typeof result.value.maxYear === 'number').toBe(true);

    for (const row of result.value.data) {
      expect(typeof row.month).toBe('number');
      expect(typeof row.day).toBe('number');
      expect(typeof row.medianPm25).toBe('number');
      expect(typeof row.p25Pm25).toBe('number');
      expect(typeof row.p75Pm25).toBe('number');
      expect(typeof row.n).toBe('number');
    }
  });
});
