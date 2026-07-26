import type { StationRaw } from './stations.js';

export function fakeStation(overrides: Partial<StationRaw> = {}): StationRaw {
  return {
    id: '2311',
    name: 'Ban Suan, Mueang',
    lat: 13.360626576582,
    lng: 100.98454092591,
    country: 'TH',
    provider: null,
    ...overrides,
  };
}

export const EMPTY_STATIONS: readonly StationRaw[] = [];

export const SMALL_STATIONS: readonly StationRaw[] = [
  fakeStation({ id: '2311', name: 'Ban Suan, Mueang', provider: null }),
  fakeStation({ id: '225572', name: 'Kasertsart University', provider: 'Air4Thai' }),
  fakeStation({ id: '24', name: 'SPARTAN - NUS', country: 'SG', provider: 'Spartan' }),
];
