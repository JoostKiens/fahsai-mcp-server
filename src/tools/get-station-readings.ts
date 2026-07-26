import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatBboxParam } from '../logic/bbox.js';
import {
  emptyStationReadingsSummary,
  stationReadingsOutputSchema,
  summarizeStationReadings,
  type StationReadingsApiResponse,
  type StationReadingsToolDeps,
  type StationReadingsToolResult,
} from '../logic/station-readings.js';
import { buildToolError, buildToolResponse } from '../logic/tool-response.js';
import { isoDateSchema } from '../schemas/date.js';
import { locationInput, resolveLocationInput } from '../schemas/location.js';

export const getStationReadingsInputSchema = z.object({
  ...locationInput.shape,
  date: isoDateSchema.optional(),
});

export type GetStationReadingsInput = z.infer<typeof getStationReadingsInputSchema>;

// The live API 404s for both "no stations in this bbox" and "not ingested yet for this
// date" with the same message — this covers both, and (defensively) a 200 with an empty
// `data` array, in case that ever changes.
function noDataNote(date?: string): string {
  return date
    ? `No station readings available for ${date}.`
    : 'No station readings currently available for this location.';
}

export function createGetStationReadingsHandler(deps: StationReadingsToolDeps) {
  return async (input: GetStationReadingsInput): Promise<StationReadingsToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    const fetchResult = await deps.client.get<StationReadingsApiResponse>(
      '/api/station-readings/latest',
      {
        bbox: formatBboxParam(bbox),
        date: input.date,
      },
    );

    if (!fetchResult.ok) {
      if (fetchResult.error.kind === 'not-found') {
        return buildToolResponse(
          emptyStationReadingsSummary(),
          locationNote,
          noDataNote(input.date),
        );
      }
      return buildToolError(fetchResult.error.message);
    }

    if (fetchResult.value.data.length === 0) {
      return buildToolResponse(emptyStationReadingsSummary(), locationNote, noDataNote(input.date));
    }

    return buildToolResponse(summarizeStationReadings(fetchResult.value.data), locationNote);
  };
}

export function registerGetStationReadings(server: McpServer, deps: StationReadingsToolDeps): void {
  server.registerTool(
    'get_station_readings',
    {
      title: 'Get latest station PM2.5 readings',
      description:
        'Latest PM2.5 ground-station measurements (OpenAQ) for a place or bounding box, each with an EPA AQI ' +
        'category. This is a measurement, not a model estimate — see `get_cams` for the gridded model instead. ' +
        'Per-station `attribution`, when present, carries source-specific requirements beyond the blanket ' +
        'OpenAQ CC BY 4.0 attribution and must not be dropped.',
      inputSchema: getStationReadingsInputSchema.shape,
      outputSchema: stationReadingsOutputSchema.shape,
    },
    createGetStationReadingsHandler(deps),
  );
}
