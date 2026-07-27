import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { isoDateSchema } from '../../shared/schema/date.js';
import { locationInput } from '../../shared/schema/location.js';

export const getCamsInputSchema = z.object({
  ...locationInput.shape,
  date: isoDateSchema,
  include_raw_grid: z.boolean().optional(),
});

export type GetCamsInput = z.infer<typeof getCamsInputSchema>;

// Hard cap on the opt-in raw grid — "full raw data only behind an explicit opt-in param,
// with a hard cap" for the up-to-4,599-point CAMS grid.
export const CAMS_GRID_MAX = 500;

export interface CamsStat {
  readonly pm25: number | null;
  readonly aqiCategory: string | null;
}

export interface CamsAreaSummary {
  readonly pointCount: number;
  readonly mean: CamsStat;
  readonly median: CamsStat;
  readonly p95: CamsStat;
}

export interface CamsGridPoint {
  readonly lat: number;
  readonly lng: number;
  readonly pm25: number;
  readonly aqiCategory: string | null;
}

// Single output shape models both response variants (summary-only vs summary+raw-grid) via
// optional fields, same approach as get_weather's summary/rawPoints.
export interface CamsSummary {
  readonly total: number;
  readonly summary: CamsAreaSummary;
  readonly grid?: readonly CamsGridPoint[];
  readonly gridTruncated?: boolean;
  readonly note?: string;
}

const camsStatOutputSchema = z.object({
  pm25: z.number().nullable(),
  aqiCategory: z.string().nullable(),
});

const camsAreaSummaryOutputSchema = z.object({
  pointCount: z.number(),
  mean: camsStatOutputSchema,
  median: camsStatOutputSchema,
  p95: camsStatOutputSchema,
});

const camsGridPointOutputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  pm25: z.number(),
  aqiCategory: z.string().nullable(),
});

export const camsSummaryOutputSchema = z.object({
  total: z.number(),
  summary: camsAreaSummaryOutputSchema,
  grid: z.array(camsGridPointOutputSchema).optional(),
  gridTruncated: z.boolean().optional(),
  note: z.string().optional(),
});

export type CamsToolResult = CallToolResult;
