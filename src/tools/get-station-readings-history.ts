import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  emptyStationReadingsHistorySummary,
  STATION_READINGS_HISTORY_MAX_HOURS,
  stationReadingsHistoryOutputSchema,
  summarizeStationReadingsHistory,
  type StationReadingsHistoryApiResponse,
  type StationReadingsHistoryToolDeps,
  type StationReadingsHistoryToolResult,
} from '../logic/station-readings-history.js';
import { buildToolError, buildToolResponse } from '../logic/tool-response.js';

export const getStationReadingsHistoryInputSchema = z.object({
  station_id: z.string().min(1),
  // Not a literal `'pm25'`: the live API confirmed-ignores this param regardless of value
  // (see logic/station-readings-history.ts), so rejecting anything other than 'pm25' would
  // just be confusing friction with no behavioral payoff — accept and ignore, like the API does.
  parameter: z.string().default('pm25'),
  hours: z.number().int().positive().max(STATION_READINGS_HISTORY_MAX_HOURS).default(24),
});

export type GetStationReadingsHistoryInput = z.infer<typeof getStationReadingsHistoryInputSchema>;

function noDataNote(stationId: string, hours: number): string {
  return (
    `No PM2.5 readings found for station ${stationId} in the last ${hours}h — the station_id ` +
    'may be invalid (see get_stations), or data may not be ingested for this window yet.'
  );
}

export function createGetStationReadingsHistoryHandler(deps: StationReadingsHistoryToolDeps) {
  return async (
    input: GetStationReadingsHistoryInput,
  ): Promise<StationReadingsHistoryToolResult> => {
    // `parameter` is not forwarded — confirmed a no-op on this route (see logic/station-readings-history.ts).
    const fetchResult = await deps.client.get<StationReadingsHistoryApiResponse>(
      '/api/station-readings/history',
      { station_id: input.station_id, hours: input.hours },
    );

    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    // fahsai-client casts the parsed JSON straight to T with no runtime check — guard against
    // a malformed success body (e.g. `{ data: null }`) instead of letting `.length` throw.
    const data = Array.isArray(fetchResult.value.data) ? fetchResult.value.data : [];

    if (data.length === 0) {
      return buildToolResponse(
        emptyStationReadingsHistorySummary(input.station_id, input.hours),
        noDataNote(input.station_id, input.hours),
      );
    }

    return buildToolResponse(summarizeStationReadingsHistory(data, input.station_id, input.hours));
  };
}

export function registerGetStationReadingsHistory(
  server: McpServer,
  deps: StationReadingsHistoryToolDeps,
): void {
  server.registerTool(
    'get_station_readings_history',
    {
      title: 'Get PM2.5 reading history for a station',
      description:
        'Raw PM2.5 reading time series for a single station, each point with an EPA AQI category — use this for ' +
        '"when exactly did it spike" questions that a daily rollup can\'t answer. Requires a `station_id` from ' +
        '`get_stations` or `get_station_readings` — a place name is not valid input here. `hours` (default 24, max ' +
        `${STATION_READINGS_HISTORY_MAX_HOURS}) sets how far back to look; \`parameter\` only supports pm25 data ` +
        "today (any other value is ignored). Note: intraday granularity depends on the station's data provider " +
        "and isn't guaranteed — some stations report at most once per day.",
      inputSchema: getStationReadingsHistoryInputSchema.shape,
      outputSchema: stationReadingsHistoryOutputSchema.shape,
    },
    createGetStationReadingsHistoryHandler(deps),
  );
}
