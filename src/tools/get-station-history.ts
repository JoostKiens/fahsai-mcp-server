import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  emptyStationHistorySummary,
  STATION_HISTORY_DEFAULT_DAYS,
  STATION_HISTORY_MAX_DAYS,
  stationHistoryOutputSchema,
  summarizeStationHistory,
  type StationHistoryApiResponse,
  type StationHistoryToolDeps,
  type StationHistoryToolResult,
} from '../logic/station-history.js';
import { buildToolError, buildToolResponse } from '../logic/tool-response.js';
import { isoDateSchema } from '../schemas/date.js';

export const getStationHistoryInputSchema = z.object({
  station_id: z.string().min(1),
  days: z.number().int().positive().max(STATION_HISTORY_MAX_DAYS).default(STATION_HISTORY_DEFAULT_DAYS),
  date: isoDateSchema.optional(),
});

export type GetStationHistoryInput = z.infer<typeof getStationHistoryInputSchema>;

export function createGetStationHistoryHandler(deps: StationHistoryToolDeps) {
  return async (input: GetStationHistoryInput): Promise<StationHistoryToolResult> => {
    const fetchResult = await deps.client.get<StationHistoryApiResponse>(
      `/api/stations/${encodeURIComponent(input.station_id)}/history`,
      { days: input.days, date: input.date },
    );

    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    // fahsai-client casts the parsed JSON straight to T with no runtime check — guard against
    // a malformed success body (e.g. `{ days: null }`) instead of letting `.map` throw.
    const days = Array.isArray(fetchResult.value.days) ? fetchResult.value.days : [];

    if (days.length === 0) {
      return buildToolResponse(emptyStationHistorySummary(input.station_id, input.days));
    }

    return buildToolResponse(summarizeStationHistory(days, input.station_id, input.days));
  };
}

export function registerGetStationHistory(server: McpServer, deps: StationHistoryToolDeps): void {
  server.registerTool(
    'get_station_history',
    {
      title: 'Get daily PM2.5/weather rollup history for a station',
      description:
        'Daily rollup for a single station — one row per calendar day with mean PM2.5 (EPA AQI category attached), ' +
        'reading count, weather (wind formatted as compass labels, precipitation, humidity), and that day\'s ' +
        'baseline stats, where available. Requires a `station_id` from `get_stations` or `get_station_readings` — ' +
        'a place name is not valid input here. `days` (default 7, max 30) sets how many days back from `date` ' +
        '(default: latest available) to return. A day with no PM2.5 reading ingested yet reports `pm25`/' +
        '`aqiCategory` as null rather than a misleading zero; `weather`/`baseline` are null when not available ' +
        'for that day.',
      inputSchema: getStationHistoryInputSchema.shape,
      outputSchema: stationHistoryOutputSchema.shape,
    },
    createGetStationHistoryHandler(deps),
  );
}
