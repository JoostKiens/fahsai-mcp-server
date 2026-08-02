import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { CamsSummaryDayRaw } from './handler.js';
import { CAMS_SUMMARY_RANGE_MAX_DAYS } from './schema.js';

interface CamsSummaryApiResponse {
  readonly data: readonly CamsSummaryDayRaw[];
}

interface LatestDateApiResponse {
  readonly date: string;
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

describe('/api/cams/summary (live)', () => {
  it('returns { data: [{ date, pm25 }] } for a short range', async () => {
    const client = createFahsaiClient();

    const latest = await client.get<LatestDateApiResponse>('/api/latest-date');
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error('Expected a successful response');

    const end = latest.value.date;
    const start = shiftDate(end, -5);

    const result = await client.get<CamsSummaryApiResponse>('/api/cams/summary', { start, end });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(Array.isArray(result.value.data)).toBe(true);

    for (const day of result.value.data) {
      expect(typeof day.date).toBe('string');
      expect(typeof day.pm25).toBe('number');
    }
  });

  // This route's range cap has been observed changing live before (120->140 days during
  // JOO-35), so this re-verifies CAMS_SUMMARY_RANGE_MAX_DAYS against the live API directly,
  // bypassing this repo's own validateDateRange (which would reject a too-long range
  // client-side before ever reaching the network).
  it('still enforces CAMS_SUMMARY_RANGE_MAX_DAYS as the live boundary', async () => {
    const client = createFahsaiClient();

    const latest = await client.get<LatestDateApiResponse>('/api/latest-date');
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error('Expected a successful response');

    const end = latest.value.date;

    const atCap = await client.get<CamsSummaryApiResponse>('/api/cams/summary', {
      start: shiftDate(end, -CAMS_SUMMARY_RANGE_MAX_DAYS),
      end,
    });
    expect(atCap.ok).toBe(true);

    const overCap = await client.get<CamsSummaryApiResponse>('/api/cams/summary', {
      start: shiftDate(end, -(CAMS_SUMMARY_RANGE_MAX_DAYS + 1)),
      end,
    });
    expect(overCap.ok).toBe(false);
    if (overCap.ok) throw new Error('Expected the API to reject a range over the cap');
    expect(overCap.error.kind).toBe('client-error');
  });
});
