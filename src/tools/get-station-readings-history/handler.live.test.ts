import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { StationReadingsHistoryApiResponse } from './handler.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

// Only the field this test needs — importing the full type from ../get-stations/handler.js
// would cross the tool/tool module boundary eslint enforces (siblings can't reach into each
// other's folders; see eslint.config.cjs's no-restricted-paths).
interface StationLookupResponse {
  readonly data: readonly { readonly id: string }[];
}

describe('/api/station-readings/history (live)', () => {
  it('returns { data } wrapped readings for a real station id', async () => {
    const client = createFahsaiClient();

    // A bogus station_id doesn't 404 here — it returns 200 with an empty `data` array
    // (documented gotcha), so a hardcoded id would let this test pass without checking
    // anything real. Fetch a real one from /api/stations instead.
    const stations = await client.get<StationLookupResponse>('/api/stations', { bbox: SMALL_BBOX });
    expect(stations.ok).toBe(true);
    if (!stations.ok) throw new Error('Expected a successful response');
    expect(stations.value.data.length).toBeGreaterThan(0);
    const stationId = stations.value.data[0].id;

    const result = await client.get<StationReadingsHistoryApiResponse>(
      '/api/station-readings/history',
      { station_id: stationId, hours: 24 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(Array.isArray(result.value.data)).toBe(true);

    for (const point of result.value.data) {
      expect(typeof point.stationId).toBe('string');
      expect(typeof point.value).toBe('number');
      expect(typeof point.measuredAt).toBe('string');
    }
  });
});
