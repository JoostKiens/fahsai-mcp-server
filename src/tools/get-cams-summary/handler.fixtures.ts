import type { CamsSummaryDayRaw } from './handler.js';

// REAL live response, verbatim (start=2026-07-01, end=2026-07-10, verified 2026-07-27, JOO-35).
// Every value falls in the Moderate AQI band (12.1-35.4).
export const TEN_DAY_CAMS_SUMMARY: readonly CamsSummaryDayRaw[] = [
  { date: '2026-07-01', pm25: 19.4 },
  { date: '2026-07-02', pm25: 18 },
  { date: '2026-07-03', pm25: 19.1 },
  { date: '2026-07-04', pm25: 18.9 },
  { date: '2026-07-05', pm25: 18.7 },
  { date: '2026-07-06', pm25: 20.2 },
  { date: '2026-07-07', pm25: 20.2 },
  { date: '2026-07-08', pm25: 22.7 },
  { date: '2026-07-09', pm25: 21.1 },
  { date: '2026-07-10', pm25: 21.3 },
];

export const EMPTY_CAMS_SUMMARY: readonly CamsSummaryDayRaw[] = [];
