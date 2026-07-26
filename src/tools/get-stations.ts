import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatBboxParam } from '../logic/bbox.js';
import {
  stationsOutputSchema,
  summarizeStations,
  type StationsApiResponse,
  type StationsToolDeps,
  type StationsToolResult,
} from '../logic/stations.js';
import { buildToolError, buildToolResponse } from '../logic/tool-response.js';
import { locationInput, resolveLocationInput } from '../schemas/location.js';

export const getStationsInputSchema = z.object({
  ...locationInput.shape,
});

export type GetStationsInput = z.infer<typeof getStationsInputSchema>;

export function createGetStationsHandler(deps: StationsToolDeps) {
  return async (input: GetStationsInput): Promise<StationsToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    const fetchResult = await deps.client.get<StationsApiResponse>('/api/stations', {
      bbox: formatBboxParam(bbox),
    });

    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    // fahsai-client casts the parsed JSON straight to T with no runtime check — guard against
    // a malformed success body (e.g. a bare `null`, or a `data` field that's missing/renamed)
    // instead of letting `.data` access or downstream array methods throw. A bbox with
    // genuinely zero stations is a normal, common result (verified live), so this is
    // deliberately silent rather than attaching a "may be malformed" note — unlike
    // get-station-history.ts, where an empty result is never a valid response on its own.
    const data = Array.isArray(fetchResult.value?.data) ? fetchResult.value.data : [];

    return buildToolResponse(summarizeStations(data), locationNote);
  };
}

export function registerGetStations(server: McpServer, deps: StationsToolDeps): void {
  server.registerTool(
    'get_stations',
    {
      title: 'Get monitoring stations for a location',
      description:
        'All PM2.5 ground-monitoring stations (OpenAQ) for a place or bounding box, with id, name, coordinates, ' +
        'country, and provider. This is the way to discover the `station_id` values needed by ' +
        '`get_station_readings_history`, `get_station_history`, and `get_station_baseline` — call this first to ' +
        'find a station near a location, then pass its `id` as `station_id` to those tools.',
      inputSchema: getStationsInputSchema.shape,
      outputSchema: stationsOutputSchema.shape,
    },
    createGetStationsHandler(deps),
  );
}
