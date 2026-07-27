import type { StationHistoryDayRaw } from './handler.js';

export function fakeStationHistoryDay(overrides: Partial<StationHistoryDayRaw> = {}): StationHistoryDayRaw {
  return {
    date: '2026-07-25',
    pm25: 19.7,
    readingCount: 1,
    weather: {
      windSpeedKmh: 5.5,
      windDirectionDeg: 293,
      precipitationSumMm: 24.6,
      relativeHumidity2m: 44,
    },
    baseline: { medianPm25: 16, p25Pm25: 13.9, p75Pm25: 20.3, n: 63 },
    ...overrides,
  };
}

export const EMPTY_STATION_HISTORY: readonly StationHistoryDayRaw[] = [];

// A normal week — matches shape actually observed live for station 225572 (JOO-32).
export const NORMAL_STATION_HISTORY: readonly StationHistoryDayRaw[] = [
  fakeStationHistoryDay({ date: '2026-06-16', pm25: 16.5 }),
  fakeStationHistoryDay({ date: '2026-06-17', pm25: 13.8 }),
];

// The "no data ingested yet" sentinel: pm25:0 paired with readingCount:0, while weather is
// still present (weather comes from a separate source, decoupled from PM2.5 ingestion).
export const STATION_HISTORY_WITH_NO_DATA_DAY: readonly StationHistoryDayRaw[] = [
  fakeStationHistoryDay({
    date: '2026-07-03',
    pm25: 0,
    readingCount: 0,
  }),
];

// weather:null and baseline:null preserved as explicit nulls, not omitted.
export const STATION_HISTORY_WITH_NULL_FIELDS: readonly StationHistoryDayRaw[] = [
  fakeStationHistoryDay({ date: '2026-07-26', pm25: 0, readingCount: 0, weather: null, baseline: null }),
];

// An invalid station_id doesn't 404 — it returns a full window of the no-data sentinel with
// every field null, same gotcha as /station-readings/history.
export const BOGUS_STATION_ID_HISTORY: readonly StationHistoryDayRaw[] = Array.from(
  { length: 7 },
  (_, i) =>
    fakeStationHistoryDay({
      date: `2026-07-2${i}`,
      pm25: 0,
      readingCount: 0,
      weather: null,
      baseline: null,
    }),
);

// fahsai-client casts parsed JSON straight to T with no runtime check — a response that omits
// `weather`/`baseline` entirely (rather than sending an explicit null) is a real possibility,
// not just a hypothetical. Cast through `unknown` since this shape is deliberately invalid
// against StationHistoryDayRaw's typed contract.
export const STATION_HISTORY_WITH_UNDEFINED_FIELDS: readonly StationHistoryDayRaw[] = [
  fakeStationHistoryDay({
    date: '2026-07-26',
    weather: undefined as unknown as StationHistoryDayRaw['weather'],
    baseline: undefined as unknown as StationHistoryDayRaw['baseline'],
  }),
];

// A non-finite windDirectionDeg inside an otherwise-present weather object — malformed upstream
// data, not something the live API has been observed to send, but not runtime-validated either.
export const STATION_HISTORY_WITH_INVALID_WIND_DIRECTION: readonly StationHistoryDayRaw[] = [
  fakeStationHistoryDay({
    date: '2026-07-26',
    weather: {
      windSpeedKmh: 5.5,
      windDirectionDeg: NaN,
      precipitationSumMm: 24.6,
      relativeHumidity2m: 44,
    },
  }),
];
