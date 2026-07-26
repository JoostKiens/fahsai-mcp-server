import type { PlaceResolver, ResolvedPlace } from './index.js';

export const CHIANG_MAI_BBOX = { west: 98.5, south: 18.3, east: 99.5, north: 19.3 };

export function fakePlaceResolver(resolve: PlaceResolver['resolve']): PlaceResolver {
  return { resolve };
}

export function fakeResolvedPlace(overrides: Partial<ResolvedPlace> = {}): ResolvedPlace {
  return {
    query: 'Chiang Mai',
    matchedName: 'Chiang Mai, Thailand',
    lat: 18.7883,
    lng: 98.9853,
    bbox: CHIANG_MAI_BBOX,
    outsideCoverage: false,
    otherMatchesCount: 0,
    ...overrides,
  };
}
