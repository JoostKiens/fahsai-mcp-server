import type { StationReadingLatestRaw } from './station-readings.js';

export function fakeStationReading(
  overrides: Partial<StationReadingLatestRaw> = {},
): StationReadingLatestRaw {
  return {
    stationId: '6328962',
    stationName: 'Don Tako, Ratchaburi',
    lat: 13.51406,
    lng: 99.804503,
    country: 'TH',
    value: 5.33,
    measuredAt: '2026-07-25T00:00:00+00:00',
    ...overrides,
  };
}

export const EMPTY_STATION_READINGS: readonly StationReadingLatestRaw[] = [];

// Spans several AQI categories (Good/Moderate/Unhealthy for Sensitive Groups/Unhealthy) so
// summarizeStationReadings's aqiCategory wiring is unambiguous to assert on. The last entry
// carries an `attribution` field — never observed live (see station-readings.ts), but the
// shape here is illustrative/hypothetical for exercising the passthrough path.
export const SMALL_STATION_READINGS: readonly StationReadingLatestRaw[] = [
  fakeStationReading({ stationId: '1', stationName: 'Good Station', value: 5.33 }),
  fakeStationReading({ stationId: '2', stationName: 'Moderate Station', value: 20 }),
  fakeStationReading({ stationId: '3', stationName: 'USG Station', value: 45 }),
  fakeStationReading({
    stationId: '4',
    stationName: 'Attributed Station',
    value: 60,
    attribution: { name: 'Example Provider', url: 'https://example.test/attribution' },
  }),
];
