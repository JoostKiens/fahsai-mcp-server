import type { CamsGridRaw } from './handler.js';

// Small-area grid — REAL live response, verbatim (bbox=100,13,101,14, date=2026-07-26,
// verified 2026-07-27, JOO-35). Used to hand-verify computeAreaSummary's mean/median/p95
// against known values: mean≈9.278 (Good), median=9 (Good), p95=17.7 (Moderate).
export const SMALL_AREA_CAMS_GRID: CamsGridRaw = {
  lats: [13, 13, 13, 13.400002, 13.400002, 13.400002, 13.800003, 13.800003, 13.800003],
  lngs: [100.20001, 100.600006, 101, 100.20001, 100.600006, 101, 100.20001, 100.600006, 101],
  pm25s: [3.9, 4.3, 5.3, 6.8, 9.6, 9, 12.1, 17.7, 14.8],
};

export const EMPTY_CAMS_GRID: CamsGridRaw = { lats: [], lngs: [], pm25s: [] };

// Full nationwide grid — 4,599 points, matching the live point count for the default SEA
// bbox (89,1,114,30), verified 2026-07-27 (JOO-35). Synthetic values — this fixture exercises
// count-driven behavior (the 500-point cap, stride math, truncation note, spatial spread of
// the sample), not area-summary math a second time (SMALL_AREA_CAMS_GRID already covers that
// with real values).
export const FULL_CAMS_GRID: CamsGridRaw = {
  lats: Array.from({ length: 4599 }, (_, i) => 1 + (i % 145) * 0.2),
  lngs: Array.from({ length: 4599 }, (_, i) => 89 + Math.floor(i / 145) * 0.2),
  pm25s: Array.from({ length: 4599 }, (_, i) => 5 + (i % 50)),
};
