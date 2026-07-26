import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import {
  stationBaselineOutputSchema,
  summarizeStationBaselineDay,
  summarizeStationBaselineDefault,
  summarizeStationBaselineFull,
  type StationBaselineApiResponse,
  type StationBaselineToolDeps,
  type StationBaselineToolResult,
} from '../logic/station-baseline.js';
import { buildToolError, buildToolResponse } from '../logic/tool-response.js';

export const getStationBaselineInputSchema = z.object({
  station_id: z.string().min(1),
  full: z.boolean().default(false),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
});

export type GetStationBaselineInput = z.infer<typeof getStationBaselineInputSchema>;

const IGNORED_DAY_PARAM_NOTE = '`full` was requested — the `month`/`day` params were ignored.';

export function createGetStationBaselineHandler(deps: StationBaselineToolDeps) {
  return async (input: GetStationBaselineInput): Promise<StationBaselineToolResult> => {
    if ((input.month === undefined) !== (input.day === undefined)) {
      return buildToolError('`month` and `day` must be provided together.');
    }

    const fetchResult = await deps.client.get<StationBaselineApiResponse>(
      `/api/stations/${encodeURIComponent(input.station_id)}/baseline`,
    );

    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    // fahsai-client casts the parsed JSON straight to T with no runtime check — guard against
    // a malformed success body instead of letting downstream array methods throw.
    const data = Array.isArray(fetchResult.value.data) ? fetchResult.value.data : [];
    const minYear = fetchResult.value.minYear ?? null;
    const maxYear = fetchResult.value.maxYear ?? null;

    const hasDay = input.month !== undefined && input.day !== undefined;

    if (input.full) {
      const summary = summarizeStationBaselineFull(data, minYear, maxYear, input.station_id);
      return buildToolResponse(summary, hasDay ? IGNORED_DAY_PARAM_NOTE : undefined);
    }

    if (hasDay) {
      return buildToolResponse(
        summarizeStationBaselineDay(data, minYear, maxYear, input.station_id, input.month!, input.day!),
      );
    }

    return buildToolResponse(summarizeStationBaselineDefault(data, minYear, maxYear, input.station_id));
  };
}

export function registerGetStationBaseline(server: McpServer, deps: StationBaselineToolDeps): void {
  server.registerTool(
    'get_station_baseline',
    {
      title: "Get a station's historical PM2.5 baseline (climatology)",
      description:
        "A station's calendar-day PM2.5 climatology (median/p25/p75 per day-of-year, aggregated across years, each " +
        'value with its own EPA AQI category) — use this to answer "is this normal for the time of year" ' +
        'questions. Requires a `station_id` from ' +
        '`get_stations` or `get_station_readings` — a place name is not valid input here. By default returns the ' +
        "current season's min/median/max plus today's specific day-of-year stats; pass `month`+`day` together for " +
        'a specific day instead, or `full: true` for the entire 365-day curve (large — only ask for this if you ' +
        'need the whole shape). Any day/aggregate built from fewer than 30 samples is flagged `thin: true` — treat ' +
        'it as statistically weak.',
      inputSchema: getStationBaselineInputSchema.shape,
      outputSchema: stationBaselineOutputSchema.shape,
    },
    createGetStationBaselineHandler(deps),
  );
}
