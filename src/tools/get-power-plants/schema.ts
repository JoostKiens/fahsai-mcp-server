import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { locationInput } from '../../shared/schema/location.js';

export const getPowerPlantsInputSchema = z.object({
  ...locationInput.shape,
  include_all: z.boolean().optional(),
});

export type GetPowerPlantsInput = z.infer<typeof getPowerPlantsInputSchema>;

export type PowerPlantsToolResult = CallToolResult;

// Below this count, always return the full `plants` list — no point summarizing a handful of
// results. Above it, summarize by default; `include_all` opts back into the full list.
export const POWER_PLANTS_FULL_LIST_THRESHOLD = 100;
// Top-N by capacity_mw shown in summary mode.
export const POWER_PLANTS_TOP_N = 15;
// Hard cap even with `include_all` — the live dataset never gets close to this (357 features
// at the full FAHSAI_DATA_BBOX scope), but CLAUDE.md requires a cap on any explicit opt-in.
export const POWER_PLANTS_MAX_PLANTS = 500;

export const FUEL_TYPE_VALUES = ['Coal', 'Gas', 'Oil'] as const;
export type FuelType = (typeof FUEL_TYPE_VALUES)[number];

export interface PowerPlant {
  readonly id: number;
  readonly name: string;
  readonly country: string;
  readonly fuelType: FuelType;
  readonly capacityMw: number;
  readonly owner: string | null;
  readonly commissionedYear: number | null;
  readonly lat: number;
  readonly lng: number;
}

export interface PowerPlantsSummary {
  readonly total: number;
  readonly byCountry: Record<string, number>;
  readonly byFuelType: Record<string, number>;
  readonly topByCapacity: readonly PowerPlant[];
  readonly plants?: readonly PowerPlant[];
  readonly note?: string;
}

const powerPlantSchema = z.object({
  id: z.number(),
  name: z.string(),
  country: z.string(),
  fuelType: z.enum(FUEL_TYPE_VALUES),
  capacityMw: z.number(),
  owner: z.string().nullable(),
  commissionedYear: z.number().nullable(),
  lat: z.number(),
  lng: z.number(),
});

export const powerPlantsOutputSchema = z.object({
  total: z.number(),
  byCountry: z.record(z.string(), z.number()),
  byFuelType: z.record(z.string(), z.number()),
  topByCapacity: z.array(powerPlantSchema),
  plants: z.array(powerPlantSchema).optional(),
  note: z.string().optional(),
});
