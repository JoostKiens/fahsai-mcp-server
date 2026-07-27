import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { BoundingBox } from '../../shared/bbox.js';
import { bboxSchema } from '../../shared/schema/location.js';

// Deliberately not the shared `locationInput` fragment — this tool resolves a place, it
// doesn't accept a bbox to resolve against (mcp-tools.md's "compose locationInput" rule
// assumes a tool that goes on to call the Fahsai API with a bbox; this one doesn't).
export const geocodePlaceInputSchema = z.object({
  place: z.string().min(1),
  radius_km: z.number().positive().optional(),
});

export type GeocodePlaceInput = z.infer<typeof geocodePlaceInputSchema>;

export type GeocodePlaceToolResult = CallToolResult;

export interface GeocodePlaceSummary {
  readonly matchedName: string;
  readonly lat: number;
  readonly lng: number;
  readonly bbox: BoundingBox;
  readonly note?: string;
}

export const geocodePlaceOutputSchema = z.object({
  matchedName: z.string(),
  lat: z.number(),
  lng: z.number(),
  bbox: bboxSchema,
  note: z.string().optional(),
});
