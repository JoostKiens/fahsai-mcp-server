import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { AqiCategory } from '../../shared/aqi.js';
import { isoDateSchema } from '../../shared/schema/date.js';
import { locationInput } from '../../shared/schema/location.js';

export const getStationReadingsInputSchema = z.object({
  ...locationInput.shape,
  date: isoDateSchema.optional(),
});

export type GetStationReadingsInput = z.infer<typeof getStationReadingsInputSchema>;

export interface StationReadingSummary {
  readonly stationId: string;
  readonly stationName: string;
  readonly lat: number;
  readonly lng: number;
  readonly country: string;
  readonly measuredAt: string;
  readonly pm25: number;
  readonly aqiCategory: AqiCategory;
  readonly attribution?: unknown;
}

export interface StationReadingsSummary {
  readonly total: number;
  readonly readings: readonly StationReadingSummary[];
  readonly note?: string;
}

export const stationReadingsOutputSchema = z.object({
  total: z.number(),
  readings: z.array(
    z.object({
      stationId: z.string(),
      stationName: z.string(),
      lat: z.number(),
      lng: z.number(),
      country: z.string(),
      measuredAt: z.string(),
      pm25: z.number(),
      aqiCategory: z.string(),
      attribution: z.unknown().optional(),
    }),
  ),
  note: z.string().optional(),
});

export type StationReadingsToolResult = CallToolResult;
