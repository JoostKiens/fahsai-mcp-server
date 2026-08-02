import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { StationReadingsApiResponse } from './handler.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

interface LatestDateApiResponse {
  readonly date: string;
}

describe('/api/station-readings/latest (live)', () => {
  it('returns { data } wrapped station readings matching the documented shape', async () => {
    const client = createFahsaiClient();

    // Omitting `date` was observed live (2026-08-02) to 404 the same way an explicit
    // today's-date does, not to fall back to a rolling last-24h window as
    // fahsai-api-reference.md's "date optional (last 24h if absent)" claims — see the note
    // added there. Pass the API's own latest-complete-date explicitly instead of relying on
    // that claimed default.
    const latest = await client.get<LatestDateApiResponse>('/api/latest-date');
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error('Expected a successful response');

    const result = await client.get<StationReadingsApiResponse>('/api/station-readings/latest', {
      bbox: SMALL_BBOX,
      date: latest.value.date,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(Array.isArray(result.value.data)).toBe(true);
    expect(result.value.data.length).toBeGreaterThan(0);

    for (const reading of result.value.data) {
      expect(typeof reading.stationId).toBe('string');
      expect(typeof reading.stationName).toBe('string');
      expect(typeof reading.lat).toBe('number');
      expect(typeof reading.lng).toBe('number');
      expect(typeof reading.country).toBe('string');
      expect(typeof reading.value).toBe('number');
      expect(typeof reading.measuredAt).toBe('string');
    }
  });
});
