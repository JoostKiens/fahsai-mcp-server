import type { StationReadingLatestRaw } from '../station-readings.js';

// Defaults sit near a bbox centered on Chiang Mai ({ west: 98.5, south: 18.3, east: 99.5,
// north: 19.3 }, center ~18.8,99.0) — matches CHIANG_MAI_BBOX used elsewhere in this repo's
// tests, so distances in these fixtures are easy to reason about against that bbox.
export function fakeStationReading(
  overrides: Partial<StationReadingLatestRaw> = {},
): StationReadingLatestRaw {
  return {
    stationId: 'station-1',
    stationName: 'Test Station',
    lat: 18.81,
    lng: 99.01,
    country: 'THA',
    value: 20,
    measuredAt: '2026-07-25T08:00:00Z',
    ...overrides,
  };
}

export const EMPTY_STATION_READINGS: readonly StationReadingLatestRaw[] = [];

// Distances from the Chiang Mai bbox center (~18.8, 99.0): 'near' ~1.5km, 'mid' ~34km,
// 'far' ~93km (beyond the 50km cutoff) — 'near' should always win.
export const STATIONS_BY_DISTANCE: readonly StationReadingLatestRaw[] = [
  fakeStationReading({ stationId: 'far', lat: 19.5, lng: 99.5 }),
  fakeStationReading({ stationId: 'near', lat: 18.81, lng: 99.01 }),
  fakeStationReading({ stationId: 'mid', lat: 19.0, lng: 99.25 }),
];

// Both ~139km from the Chiang Mai bbox center — every candidate exceeds the cutoff.
export const STATIONS_ALL_BEYOND_CUTOFF: readonly StationReadingLatestRaw[] = [
  fakeStationReading({ stationId: 'far-1', lat: 19.8, lng: 99.8 }),
  fakeStationReading({ stationId: 'far-2', lat: 17.8, lng: 98.2 }),
];

// 'wrong-date' is the closer of the two (~0.7km from center) but its reading is from the
// day before the requested date; 'near' is farther (~7km) but has a matching reading —
// date-filtering must skip 'wrong-date' in favor of 'near'.
export const STATIONS_MIXED_DATES: readonly StationReadingLatestRaw[] = [
  fakeStationReading({
    stationId: 'wrong-date',
    lat: 18.805,
    lng: 99.005,
    measuredAt: '2026-07-24T08:00:00Z',
  }),
  fakeStationReading({
    stationId: 'near',
    lat: 18.85,
    lng: 99.05,
    measuredAt: '2026-07-25T08:00:00Z',
  }),
];
