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

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

describe('/api/fires/range (live)', () => {
  it('returns { data } wrapped fire points for a short range, well under the 10-day cap', async () => {
    const client = createFahsaiClient();

    const latest = await client.get<LatestDateApiResponse>('/api/latest-date');
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error('Expected a successful response');

    const end = latest.value.date;
    const start = shiftDate(end, -3);

    const result = await client.get<FiresApiResponse>('/api/fires/range', {
      start,
      end,
      bbox: SMALL_BBOX,
    });

    // A 404 here is ambiguous by itself — it can mean "not ingested yet" OR "ingested, but zero
    // fires in this small bbox" (VERIFIED 2026-08-13 via direct curl: the same fully-ingested
    // date 404s against a small place-derived bbox and even a country-sized bbox, while 200ing
    // against the full default coverage bbox). This live test only exercises the raw client, so
    // either kind of 404 is a valid outcome here — it doesn't need to disambiguate. The
    // tool-facing distinction (and the confirmation retry that makes it) lives in
    // fetchAndSummarizeFires/isPeriodIngested (src/shared/fires/handler.ts), covered by its own
    // unit tests, not this live smoke test.
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
