import type { FireConfidence, FirePoint } from './fires.logic.js';

export function fakeFirePoint(overrides: Partial<FirePoint> = {}): FirePoint {
  return {
    id: 1,
    detectedAt: '2026-04-18T06:12:00Z',
    lat: 18.7883,
    lng: 98.9853,
    frp: 12.3,
    brightTi4: 320.1,
    brightTi5: 300.4,
    countryId: 'THA',
    satellite: 'N',
    confidence: 'nominal',
    daynight: 'D',
    ...overrides,
  };
}

export const EMPTY_FIRES: readonly FirePoint[] = [];

export const SMALL_FIRES: readonly FirePoint[] = [
  fakeFirePoint({ id: 1, frp: 5, confidence: 'high' }),
  fakeFirePoint({ id: 2, frp: 20, confidence: 'nominal' }),
  fakeFirePoint({ id: 3, frp: null, confidence: 'low' }),
  fakeFirePoint({ id: 4, frp: 8, confidence: null }),
];

const CONFIDENCE_CYCLE: readonly FireConfidence[] = ['high', 'nominal', 'low'];

// 60 points — above FIRE_LIST_TRUNCATION_THRESHOLD (50) — with distinct FRP values so
// top-N-by-FRP ordering is unambiguous to assert on.
export const LARGE_FIRES: readonly FirePoint[] = Array.from({ length: 60 }, (_, i) =>
  fakeFirePoint({
    id: i + 1,
    frp: i, // fire id 60 has the highest FRP (59), id 1 the lowest (0)
    confidence: CONFIDENCE_CYCLE[i % CONFIDENCE_CYCLE.length],
  }),
);
