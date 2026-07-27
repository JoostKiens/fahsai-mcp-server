import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetStationBaselineHandler, type StationBaselineToolDeps } from './handler.js';
import { getStationBaselineInputSchema, stationBaselineOutputSchema } from './schema.js';

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
