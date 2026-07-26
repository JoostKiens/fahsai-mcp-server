import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  geocodePlaceOutputSchema,
  toGeocodePlaceSummary,
  type GeocodePlaceToolDeps,
  type GeocodePlaceToolResult,
} from '../logic/geocode-place.js';
import { buildToolError, buildToolResponse } from '../logic/tool-response.js';
import { placeOutsideCoverageMessage } from '../schemas/location.js';

// Deliberately not the shared `locationInput` fragment — this tool resolves a place, it
// doesn't accept a bbox to resolve against (mcp-tools.md's "compose locationInput" rule
// assumes a tool that goes on to call the Fahsai API with a bbox; this one doesn't).
export const geocodePlaceInputSchema = z.object({
  place: z.string().min(1),
  radius_km: z.number().positive().optional(),
});

export type GeocodePlaceInput = z.infer<typeof geocodePlaceInputSchema>;

export function createGeocodePlaceHandler(deps: GeocodePlaceToolDeps) {
  return async (input: GeocodePlaceInput): Promise<GeocodePlaceToolResult> => {
    const result = await deps.placeResolver.resolve(input.place, { radiusKm: input.radius_km });
    if (!result.ok) {
      return buildToolError(result.error.message);
    }

    if (result.value.bbox === null) {
      return buildToolError(placeOutsideCoverageMessage(input.place));
    }

    return buildToolResponse(toGeocodePlaceSummary({ ...result.value, bbox: result.value.bbox }));
  };
}

export function registerGeocodePlace(server: McpServer, deps: GeocodePlaceToolDeps): void {
  server.registerTool(
    'geocode_place',
    {
      title: 'Resolve a place name to coordinates',
      description:
        'Resolves a place name to coordinates via Nominatim (OpenStreetMap) — returns the matched lat/lng, the ' +
        "place name as Nominatim itself resolved it (so you can confirm it matched what the user meant), and a " +
        'default bounding box around it. Every other location-aware tool already resolves a `place` param ' +
        'internally, so only use this directly when you need the coordinates themselves rather than data for ' +
        'that location.',
      inputSchema: geocodePlaceInputSchema.shape,
      outputSchema: geocodePlaceOutputSchema.shape,
    },
    createGeocodePlaceHandler(deps),
  );
}
