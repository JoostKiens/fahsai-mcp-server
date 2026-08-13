import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import {
  fakePlaceResolver,
  fakeResolvedPlace,
} from '../../shared/place-resolver/place-resolver.fixtures.js';
import {
  CHIANG_MAI_AREA_POWER_PLANT_FEATURES,
  EMPTY_POWER_PLANT_FEATURES,
  fakePowerPlantFeature,
  SEA_AND_OUTSIDE_POWER_PLANT_FEATURES,
} from './handler.fixtures.js';
import { createGetPowerPlantsHandler, summarizePowerPlants, toPowerPlant } from './handler.js';
import { POWER_PLANTS_FULL_LIST_THRESHOLD, POWER_PLANTS_MAX_PLANTS } from './schema.js';

describe('summarizePowerPlants', () => {
  it('computes total, byCountry/byFuelType breakdowns, and topByCapacity ordering', () => {
    const plants = SEA_AND_OUTSIDE_POWER_PLANT_FEATURES.map(toPowerPlant);
    const summary = summarizePowerPlants(plants, false);

    expect(summary.total).toBe(3);
    expect(summary.byCountry).toEqual({ THA: 2, CHN: 1 });
    expect(summary.byFuelType).toEqual({ Gas: 1, Coal: 2 });
    expect(summary.topByCapacity.map((p) => p.name)).toEqual([
      'East Hope Metals Wucaiwan power station',
      'Bang Pakong',
      'Mae Mah',
    ]);
  });

  it('includes the full plants list when at or below the threshold', () => {
    const plants = SEA_AND_OUTSIDE_POWER_PLANT_FEATURES.map(toPowerPlant);
    const summary = summarizePowerPlants(plants, false);

    expect(summary.plants).toEqual(plants);
    expect(summary.note).toBeUndefined();
  });

  it('omits the full list and adds a note when above the threshold and include_all is not set', () => {
    const plants = Array.from({ length: POWER_PLANTS_FULL_LIST_THRESHOLD + 1 }, (_, i) =>
      toPowerPlant(fakePowerPlantFeature({ id: i, name: `Plant ${i}`, capacity_mw: i })),
    );

    const summary = summarizePowerPlants(plants, false);

    expect(summary.total).toBe(POWER_PLANTS_FULL_LIST_THRESHOLD + 1);
    expect(summary.plants).toBeUndefined();
    expect(summary.note).toContain('include_all');
  });

  it('returns the full list when include_all is set, even above the threshold', () => {
    const plants = Array.from({ length: POWER_PLANTS_FULL_LIST_THRESHOLD + 1 }, (_, i) =>
      toPowerPlant(fakePowerPlantFeature({ id: i, name: `Plant ${i}`, capacity_mw: i })),
    );

    const summary = summarizePowerPlants(plants, true);

    expect(summary.plants).toHaveLength(POWER_PLANTS_FULL_LIST_THRESHOLD + 1);
    expect(summary.note).toBeUndefined();
  });

  it('caps include_all at POWER_PLANTS_MAX_PLANTS with a truncation note', () => {
    const plants = Array.from({ length: POWER_PLANTS_MAX_PLANTS + 5 }, (_, i) =>
      toPowerPlant(fakePowerPlantFeature({ id: i, name: `Plant ${i}`, capacity_mw: i })),
    );

    const summary = summarizePowerPlants(plants, true);

    expect(summary.plants).toHaveLength(POWER_PLANTS_MAX_PLANTS);
    expect(summary.note).toContain(`${POWER_PLANTS_MAX_PLANTS}`);
  });
});

describe('createGetPowerPlantsHandler', () => {
  it('defaults to FAHSAI_DATA_BBOX and filters out plants outside it', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { type: 'FeatureCollection', features: SEA_AND_OUTSIDE_POWER_PLANT_FEATURES },
    });
    const handler = createGetPowerPlantsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({});

    expect(get).toHaveBeenCalledWith('/api/power-plants');
    expect(resolve).not.toHaveBeenCalled();
    const structured = result.structuredContent as {
      total: number;
      byCountry: Record<string, number>;
    };
    expect(structured.total).toBe(2); // the two THA plants; the CHN one is outside FAHSAI_DATA_BBOX
    expect(structured.byCountry).toEqual({ THA: 2 });
  });

  it('filters client-side to a resolved place bbox', async () => {
    const resolve = vi.fn().mockResolvedValue({ ok: true, value: fakeResolvedPlace() });
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { type: 'FeatureCollection', features: CHIANG_MAI_AREA_POWER_PLANT_FEATURES },
    });
    const handler = createGetPowerPlantsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Chiang Mai' });

    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(1);
  });

  it('treats a malformed (non-object) success body as an empty result rather than throwing', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({ ok: true, value: null });
    const handler = createGetPowerPlantsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({});

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(0);
  });

  it('returns isError when location resolution fails', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { kind: 'not-found', message: 'No match' } });
    const get = vi.fn();
    const handler = createGetPowerPlantsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({ place: 'Nowhereville' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetPowerPlantsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({});

    expect(result.isError).toBe(true);
  });

  it('returns an empty result for a bbox with no plants', async () => {
    const resolve = vi.fn();
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { type: 'FeatureCollection', features: EMPTY_POWER_PLANT_FEATURES },
    });
    const handler = createGetPowerPlantsHandler({
      client: fakeClient(get),
      placeResolver: fakePlaceResolver(resolve),
    });

    const result = await handler({});

    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(0);
  });
});
