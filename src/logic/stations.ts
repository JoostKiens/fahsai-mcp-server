import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient } from '../fahsai-client/client.js';
import type { PlaceResolver } from '../place-resolver/index.js';

export interface StationsToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
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

export interface StationsApiResponse {
  readonly data: readonly StationRaw[];
}

export interface StationsSummary {
  readonly total: number;
  readonly stations: readonly StationRaw[];
  readonly note?: string;
}

export type StationsToolResult = CallToolResult;

// No truncation and nothing to classify — station lists are bounded by the physical sensor
// network, not event volume (mcp-tools.md's exception), and this endpoint carries no PM2.5 value.
export function summarizeStations(raw: readonly StationRaw[]): StationsSummary {
  return { total: raw.length, stations: raw };
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
