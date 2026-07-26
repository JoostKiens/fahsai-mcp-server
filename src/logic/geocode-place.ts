import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { PlaceResolver, ResolvedPlace } from '../place-resolver/index.js';

export interface GeocodePlaceToolDeps {
  readonly placeResolver: PlaceResolver;
}

export type GeocodePlaceToolResult = CallToolResult;

export interface GeocodePlaceSummary {
  readonly matchedName: string;
  readonly lat: number;
  readonly lng: number;
  readonly bbox: { readonly west: number; readonly south: number; readonly east: number; readonly north: number };
  readonly note?: string;
}

const bboxSchema = z.object({
  west: z.number(),
  south: z.number(),
  east: z.number(),
  north: z.number(),
});

export const geocodePlaceOutputSchema = z.object({
  matchedName: z.string(),
  lat: z.number(),
  lng: z.number(),
  bbox: bboxSchema,
  note: z.string().optional(),
});

// `resolved.bbox` is only null when outsideCoverage — callers must check that first and
// treat it as an error before calling this, so it's never null here.
export function toGeocodePlaceSummary(resolved: ResolvedPlace & { bbox: NonNullable<ResolvedPlace['bbox']> }): GeocodePlaceSummary {
  return {
    matchedName: resolved.matchedName,
    lat: resolved.lat,
    lng: resolved.lng,
    bbox: resolved.bbox,
    note:
      resolved.otherMatchesCount > 0
        ? `${resolved.otherMatchesCount} other match(es) were found for "${resolved.query}" — returning the top match.`
        : undefined,
  };
}
