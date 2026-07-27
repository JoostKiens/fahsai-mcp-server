import type { StationReadingHistoryRaw } from './handler.js';

export function fakeStationReadingHistoryPoint(
  overrides: Partial<StationReadingHistoryRaw> = {},
): StationReadingHistoryRaw {
  return {
    stationId: '6289999',
    value: 26.5,
    measuredAt: '2026-07-25T00:00:00+00:00',
    ...overrides,
  };
}

export const EMPTY_STATION_READINGS_HISTORY: readonly StationReadingHistoryRaw[] = [];

// A full 6-day window with daily-cadence points spanning several AQI categories, matching
// the shape actually observed live for station 6289999 (verified 2026-07-26, JOO-31).
export const SMALL_STATION_READINGS_HISTORY: readonly StationReadingHistoryRaw[] = [
  fakeStationReadingHistoryPoint({ value: 33.7, measuredAt: '2026-07-20T00:00:00+00:00' }),
  fakeStationReadingHistoryPoint({ value: 26.5, measuredAt: '2026-07-21T00:00:00+00:00' }),
  fakeStationReadingHistoryPoint({ value: 22.5, measuredAt: '2026-07-22T00:00:00+00:00' }),
  fakeStationReadingHistoryPoint({ value: 27.3, measuredAt: '2026-07-23T00:00:00+00:00' }),
  fakeStationReadingHistoryPoint({ value: 5.33, measuredAt: '2026-07-24T00:00:00+00:00' }),
  fakeStationReadingHistoryPoint({ value: 200, measuredAt: '2026-07-25T00:00:00+00:00' }),
];

// Fewer points than the requested window implies (e.g. hours=168 but only 2 days ingested)
// — the normal "gappy" case per live findings, not an error condition.
export const SPARSE_STATION_READINGS_HISTORY: readonly StationReadingHistoryRaw[] = [
  fakeStationReadingHistoryPoint({ value: 18.2, measuredAt: '2026-07-24T00:00:00+00:00' }),
  fakeStationReadingHistoryPoint({ value: 12.9, measuredAt: '2026-07-25T00:00:00+00:00' }),
];

// A mix of valid points and points with a malformed `value` — the live API has no runtime
// validation, so a negative/NaN value from an offline/miscalibrated sensor is a real
// possibility. summarizeStationReadingsHistory should omit these rather than throw
// (classifyAqi throws for exactly this input).
export const STATION_READINGS_HISTORY_WITH_INVALID_VALUE: readonly StationReadingHistoryRaw[] = [
  fakeStationReadingHistoryPoint({ measuredAt: '2026-07-23T00:00:00+00:00', value: 5.33 }),
  fakeStationReadingHistoryPoint({ measuredAt: '2026-07-24T00:00:00+00:00', value: -1 }),
  fakeStationReadingHistoryPoint({ measuredAt: '2026-07-25T00:00:00+00:00', value: NaN }),
  fakeStationReadingHistoryPoint({ measuredAt: '2026-07-26T00:00:00+00:00', value: 20 }),
];
