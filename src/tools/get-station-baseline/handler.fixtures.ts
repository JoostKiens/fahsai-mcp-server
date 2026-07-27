import type { StationBaselineDayRaw } from './handler.js';

export function fakeStationBaselineDay(overrides: Partial<StationBaselineDayRaw> = {}): StationBaselineDayRaw {
  return {
    month: 1,
    day: 1,
    medianPm25: 34.9,
    p25Pm25: 30.4,
    p75Pm25: 41.1,
    n: 59,
    ...overrides,
  };
}

export const EMPTY_STATION_BASELINE: readonly StationBaselineDayRaw[] = [];

// A representative slice covering peak_burning (Feb–Apr), monsoon (May–Sep), and early_dry
// (Oct–Jan) months, plus a specific well-known day (2026-07-26, this session's "today", in
// monsoon) and a thin (n<30) row — sized to what the summarizer actually touches, not a
// hand-authored full 365-row year (see NORMAL_STATION_BASELINE_FULL for that case).
export const NORMAL_STATION_BASELINE: readonly StationBaselineDayRaw[] = [
  fakeStationBaselineDay({ month: 2, day: 1, medianPm25: 40, n: 45 }),
  fakeStationBaselineDay({ month: 3, day: 15, medianPm25: 60, n: 50 }),
  fakeStationBaselineDay({ month: 4, day: 30, medianPm25: 35, n: 40 }),
  fakeStationBaselineDay({ month: 7, day: 26, medianPm25: 16, p25Pm25: 13.9, p75Pm25: 20.3, n: 63 }),
  fakeStationBaselineDay({ month: 7, day: 27, medianPm25: 15.3, n: 3 }),
  fakeStationBaselineDay({ month: 10, day: 1, medianPm25: 20, n: 55 }),
];

// Verified live shape (station 225572, JOO-32): 365 distinct days, no Feb 29, n ranging widely.
// Generated rather than hand-authored — only used where a test needs the true 365-row count.
export const NORMAL_STATION_BASELINE_FULL: readonly StationBaselineDayRaw[] = Array.from(
  { length: 12 },
  (_, monthIdx) => monthIdx + 1,
).flatMap((month) => {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return Array.from({ length: daysInMonth }, (_, dayIdx) =>
    fakeStationBaselineDay({ month, day: dayIdx + 1 }),
  );
});
