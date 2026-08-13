import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGeocodePlaceHandler, type GeocodePlaceToolDeps } from './handler.js';
import { geocodePlaceInputSchema, geocodePlaceOutputSchema } from './schema.js';

export function registerGeocodePlace(server: McpServer, deps: GeocodePlaceToolDeps): void {
  server.registerTool(
    'geocode_place',
    {
      title: 'Resolve a place name to coordinates',
      description:
        'Resolves a place name to coordinates via Nominatim (OpenStreetMap) — returns the matched lat/lng, the ' +
        'place name as Nominatim itself resolved it (so you can confirm it matched what the user meant), and a ' +
        'default bounding box around it. Every other location-aware tool already resolves a `place` param ' +
        'internally, so only use this directly when you need the coordinates themselves rather than data for ' +
        'that location.',
      inputSchema: geocodePlaceInputSchema.shape,
      outputSchema: geocodePlaceOutputSchema.shape,
    },
    createGeocodePlaceHandler(deps),
  );
}
