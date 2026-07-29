import type { PowerPlantFeatureRaw } from './handler.js';

export function fakePowerPlantFeature(
  overrides: Partial<PowerPlantFeatureRaw['properties']> = {},
  coordinates: readonly [number, number] = [101.0253, 13.501],
): PowerPlantFeatureRaw {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      id: 25,
      name: 'Bang Pakong',
      country: 'THA',
      fuel_type: 'Gas',
      capacity_mw: 4384,
      owner: 'Electric Generating Authority of Thailand',
      commissioned_year: null,
      ...overrides,
    },
  };
}

export const EMPTY_POWER_PLANT_FEATURES: readonly PowerPlantFeatureRaw[] = [];

// Real-shaped subset (verified live 2026-07-29, JOO-36): two Thailand plants inside
// FAHSAI_DATA_BBOX, one China plant far outside it.
export const SEA_AND_OUTSIDE_POWER_PLANT_FEATURES: readonly PowerPlantFeatureRaw[] = [
  fakePowerPlantFeature(
    { id: 25, name: 'Bang Pakong', country: 'THA', fuel_type: 'Gas', capacity_mw: 4384 },
    [101.0253, 13.501],
  ),
  fakePowerPlantFeature(
    {
      id: 43,
      name: 'Mae Mah',
      country: 'THA',
      fuel_type: 'Coal',
      capacity_mw: 2400,
      owner: 'Electric Generating Authority of Thailand',
      commissioned_year: 1995,
    },
    [99.7499, 18.2963],
  ),
  fakePowerPlantFeature(
    {
      id: 1169,
      name: 'East Hope Metals Wucaiwan power station',
      country: 'CHN',
      fuel_type: 'Coal',
      capacity_mw: 7000,
      owner: 'Xinjiang East Hope Non-Ferrous Metal Co Ltd.',
      commissioned_year: 2014,
    },
    [89.1138, 44.6885],
  ),
];

// One plant inside the Chiang Mai test bbox (98.5,18.3,99.5,19.3) plus one outside it —
// for `place`-scoped filtering tests. Synthetic (no live plant sits inside that exact box).
export const CHIANG_MAI_AREA_POWER_PLANT_FEATURES: readonly PowerPlantFeatureRaw[] = [
  fakePowerPlantFeature(
    { id: 9001, name: 'Test Chiang Mai Plant', country: 'THA', fuel_type: 'Gas', capacity_mw: 50 },
    [99.0, 18.8],
  ),
  fakePowerPlantFeature(
    { id: 25, name: 'Bang Pakong', country: 'THA', fuel_type: 'Gas', capacity_mw: 4384 },
    [101.0253, 13.501],
  ),
];
