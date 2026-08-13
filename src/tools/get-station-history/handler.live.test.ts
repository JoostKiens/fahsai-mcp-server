import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { StationHistoryApiResponse } from './handler.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

// Only the field this test needs — importing the full type from ../get-stations/handler.js
// would cross the tool/tool module boundary (siblings can't reach into each other's folders;
// see docs/claude/conventions.md#module-boundaries).
interface StationLookupResponse {
  readonly data: readonly { readonly id: string }[];
}

describe('/api/stations/:id/history (live)', () => {
  it('returns { stationId, days } for a real station id, matching the documented shape', async () => {
    const client = createFahsaiClient();

    // A bogus station_id doesn't 404 here either — it returns `days` at the requested length
    // filled with sentinel rows — so fetch a real id from /api/stations rather than hardcode one.
    const stations = await client.get<StationLookupResponse>('/api/stations', { bbox: SMALL_BBOX });
    expect(stations.ok).toBe(true);
    if (!stations.ok) throw new Error('Expected a successful response');
    expect(stations.value.data.length).toBeGreaterThan(0);
    const stationId = stations.value.data[0].id;

    const result = await client.get<StationHistoryApiResponse>(
      `/api/stations/${stationId}/history`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(result.value.stationId).toBe(stationId);
    expect(Array.isArray(result.value.days)).toBe(true);

    for (const day of result.value.days) {
      expect(typeof day.date).toBe('string');
      expect(typeof day.pm25).toBe('number');
      expect(typeof day.readingCount).toBe('number');
      expect(day.weather === null || typeof day.weather === 'object').toBe(true);
      expect(day.baseline === null || typeof day.baseline === 'object').toBe(true);
    }
  });
});
