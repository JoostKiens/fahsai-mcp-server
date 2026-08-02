import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { WeatherGridPointRaw } from './handler.js';

// Small bbox (central Thailand) to avoid the API's own result-size behavior at the full
// SEA-wide default bbox entirely, rather than asserting anything about that edge case here.
const SMALL_BBOX = '99,13,101,15';

interface WeatherApiResponse {
  readonly data: readonly WeatherGridPointRaw[];
}

interface LatestDateApiResponse {
  readonly date: string;
}

describe('/api/weather (live)', () => {
  it('returns { data } wrapped snake_case grid points matching the documented shape', async () => {
    const client = createFahsaiClient();

    // /api/latest-date only covers fires/CAMS/station_readings, not weather specifically — this
    // call can occasionally 404 if weather ingestion lags behind. Accepted as inherent live-test
    // flakiness (this suite is opt-in and non-CI-blocking), no retry/fallback added.
    const latest = await client.get<LatestDateApiResponse>('/api/latest-date');
    expect(latest.ok).toBe(true);
    if (!latest.ok) throw new Error('Expected a successful response');

    const result = await client.get<WeatherApiResponse>('/api/weather', {
      date: latest.value.date,
      bbox: SMALL_BBOX,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(Array.isArray(result.value.data)).toBe(true);

    for (const point of result.value.data) {
      expect(typeof point.lat).toBe('number');
      expect(typeof point.lng).toBe('number');
      expect(typeof point.wind_speed_kmh).toBe('number');
      expect(typeof point.wind_direction_deg).toBe('number');
      expect(typeof point.relative_humidity_2m).toBe('number');
      expect(typeof point.precipitation_sum).toBe('number');
    }
  });
});
