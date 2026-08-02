import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { CamsGridRaw } from './handler.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

interface CamsApiResponse {
  readonly data: CamsGridRaw;
}

interface LatestDateApiResponse {
  readonly date: string;
}

describe('/api/cams (live)', () => {
  it('returns the columnar { data: { lats, lngs, pm25s } } shape', async () => {
    const client = createFahsaiClient();

    const latest = await client.get<LatestDateApiResponse>('/api/latest-date');
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error('Expected a successful response');

    const result = await client.get<CamsApiResponse>('/api/cams', {
      date: latest.value.date,
      bbox: SMALL_BBOX,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    const { lats, lngs, pm25s } = result.value.data;
    expect(Array.isArray(lats)).toBe(true);
    expect(Array.isArray(lngs)).toBe(true);
    expect(Array.isArray(pm25s)).toBe(true);
    expect(lngs.length).toBe(lats.length);
    expect(pm25s.length).toBe(lats.length);

    for (const value of lats) expect(typeof value).toBe('number');
    for (const value of lngs) expect(typeof value).toBe('number');
    for (const value of pm25s) expect(typeof value).toBe('number');
  });
});
