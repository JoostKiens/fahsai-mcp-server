import { asArray } from '../../shared/as-array.js';
import { pointInBbox } from '../../shared/bbox.js';
import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import {
  type FuelType,
  type GetPowerPlantsInput,
  POWER_PLANTS_FULL_LIST_THRESHOLD,
  POWER_PLANTS_MAX_PLANTS,
  POWER_PLANTS_TOP_N,
  type PowerPlant,
  type PowerPlantsSummary,
  type PowerPlantsToolResult,
} from './schema.js';

export interface PowerPlantsToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

export interface PowerPlantFeatureRaw {
  readonly type: 'Feature';
  readonly geometry: { readonly type: 'Point'; readonly coordinates: readonly [number, number] };
  readonly properties: {
    readonly id: number;
    readonly name: string;
    readonly country: string;
    readonly fuel_type: FuelType;
    readonly capacity_mw: number;
    readonly owner: string | null;
    readonly commissioned_year: number | null;
  };
}

// Bare FeatureCollection — NOT { data: [...] }-wrapped, unlike every other array route
// (verified 2026-07-29, JOO-36; see fahsai-api-reference.md).
export interface PowerPlantsApiResponse {
  readonly type: 'FeatureCollection';
  readonly features: readonly PowerPlantFeatureRaw[];
}

export function toPowerPlant(feature: PowerPlantFeatureRaw): PowerPlant {
  const [lng, lat] = feature.geometry.coordinates;
  return {
    id: feature.properties.id,
    name: feature.properties.name,
    country: feature.properties.country,
    fuelType: feature.properties.fuel_type,
    capacityMw: feature.properties.capacity_mw,
    owner: feature.properties.owner,
    commissionedYear: feature.properties.commissioned_year,
    lat,
    lng,
  };
}

function countBy<K extends string>(
  plants: readonly PowerPlant[],
  key: (plant: PowerPlant) => K,
): Record<K, number> {
  const counts = {} as Record<K, number>;
  for (const plant of plants) {
    const value = key(plant);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

export function summarizePowerPlants(
  plants: readonly PowerPlant[],
  includeAll: boolean,
): PowerPlantsSummary {
  const topByCapacity = [...plants]
    .sort((a, b) => b.capacityMw - a.capacityMw)
    .slice(0, POWER_PLANTS_TOP_N);

  const summary: PowerPlantsSummary = {
    total: plants.length,
    byCountry: countBy(plants, (plant) => plant.country),
    byFuelType: countBy(plants, (plant) => plant.fuelType),
    topByCapacity,
  };

  if (plants.length <= POWER_PLANTS_FULL_LIST_THRESHOLD && !includeAll) {
    return { ...summary, plants };
  }

  if (includeAll) {
    const truncated = plants.length > POWER_PLANTS_MAX_PLANTS;
    return {
      ...summary,
      plants: plants.slice(0, POWER_PLANTS_MAX_PLANTS),
      note: truncated
        ? `Truncated to the first ${POWER_PLANTS_MAX_PLANTS} of ${plants.length} matching plants.`
        : undefined,
    };
  }

  return {
    ...summary,
    note:
      `${plants.length} plants match — showing a summary and the top ${POWER_PLANTS_TOP_N} by capacity. ` +
      'Set `include_all` to get the full list, or narrow with `place`/`bbox`.',
  };
}

export function createGetPowerPlantsHandler(deps: PowerPlantsToolDeps) {
  return async (input: GetPowerPlantsInput): Promise<PowerPlantsToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;

    const fetchResult = await deps.client.get<PowerPlantsApiResponse>('/api/power-plants');
    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    const features = asArray<PowerPlantFeatureRaw>(fetchResult.value?.features);
    const plants = features
      .map(toPowerPlant)
      .filter((plant) => pointInBbox(plant.lat, plant.lng, bbox));

    return buildToolResponse(
      summarizePowerPlants(plants, input.include_all ?? false),
      locationNote,
    );
  };
}
