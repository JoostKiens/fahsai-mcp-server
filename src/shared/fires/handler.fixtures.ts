import type { FirePoint } from './handler.js';

// FirePoint.confidence is the raw FIRMS code the live API returns: 'l'/'n'/'h' (or null),
// not the friendly 'low'/'nominal'/'high' words this tool surfaces in its output.
export function fakeFirePoint(overrides: Partial<FirePoint> = {}): FirePoint {
  return {
    id: 1,
    detectedAt: '2026-04-18T06:12:00Z',
    lat: 18.7883,
    lng: 98.9853,
    frp: 12.3,
    confidence: 'n',
    daynight: 'D',
    ...overrides,
  };
}

export const EMPTY_FIRES: readonly FirePoint[] = [];

export const SMALL_FIRES: readonly FirePoint[] = [
  fakeFirePoint({ id: 1, frp: 5, confidence: 'h' }),
  fakeFirePoint({ id: 2, frp: 20, confidence: 'n' }),
  fakeFirePoint({ id: 3, frp: null, confidence: 'l' }),
  fakeFirePoint({ id: 4, frp: 8, confidence: null }),
];

const CONFIDENCE_CODE_CYCLE = ['h', 'n', 'l'] as const;

// 60 points — above FIRE_LIST_TRUNCATION_THRESHOLD (50) — with distinct FRP values so
// top-N-by-FRP ordering is unambiguous to assert on.
export const LARGE_FIRES: readonly FirePoint[] = Array.from({ length: 60 }, (_, i) =>
  fakeFirePoint({
    id: i + 1,
    frp: i, // fire id 60 has the highest FRP (59), id 1 the lowest (0)
    confidence: CONFIDENCE_CODE_CYCLE[i % CONFIDENCE_CODE_CYCLE.length],
  }),
);
