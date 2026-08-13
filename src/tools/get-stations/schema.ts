import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { locationInput } from '../../shared/schema/location.js';

export const getStationsInputSchema = z.object({
  ...locationInput.shape,
  name: z.string().min(1).optional(),
});

export type GetStationsInput = z.infer<typeof getStationsInputSchema>;

export type StationsToolResult = CallToolResult;

export interface StationsSummary {
  readonly total: number;
  readonly stations: readonly StationRaw[];
  readonly note?: string;
}

// What /api/stations returns, wrapped as { data: StationRaw[] } — verified 2026-07-26 (JOO-33)
// against the live API. No `isMobile`/`isMonitor`/`parameters` fields exist on any live station;
// a no-match bbox is a 200 with an empty `data` array, not a 404.
export interface StationRaw {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly country: string;
  readonly provider: string | null;
}

export const stationsOutputSchema = z.object({
  total: z.number(),
  stations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      country: z.string(),
      provider: z.string().nullable(),
    }),
  ),
  note: z.string().optional(),
});
