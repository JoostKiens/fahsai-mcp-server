import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { FirePoint } from '../../shared/fires/handler.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

interface FiresApiResponse {
  readonly data: readonly FirePoint[];
}

interface LatestDateApiResponse {
  readonly date: string;
}

describe('/api/fires (live)', () => {
  it('returns { data } wrapped fire points matching the documented shape', async () => {
    const client = createFahsaiClient();

    // Use the API's own notion of "latest complete date" rather than today's calendar date —
    // ingestion runs on a schedule, so "today" can 404 before it has any data at all.
    const latest = await client.get<LatestDateApiResponse>('/api/latest-date');
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error('Expected a successful response');

    const result = await client.get<FiresApiResponse>('/api/fires', {
      date: latest.value.date,
      bbox: SMALL_BBOX,
    });

    // A 404 here means "zero fires in this small bbox today," not an error — fire activity is
    // seasonal, and the existing get_fires handler already treats this as a normal empty
    // result (see fetchAndSummarizeFires' not-found branch), not a failure.
    if (!result.ok) {
      expect(result.error.kind).toBe('not-found');
      return;
    }

    expect(Array.isArray(result.value.data)).toBe(true);

    for (const point of result.value.data) {
      expect(typeof point.id).toBe('number');
      expect(typeof point.detectedAt).toBe('string');
      expect(typeof point.lat).toBe('number');
      expect(typeof point.lng).toBe('number');
      expect(point.frp === null || typeof point.frp === 'number').toBe(true);
      expect(point.confidence === null || typeof point.confidence === 'string').toBe(true);
      expect(point.daynight === null || typeof point.daynight === 'string').toBe(true);
    }
  });
});
