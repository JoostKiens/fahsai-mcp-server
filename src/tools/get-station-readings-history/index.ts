import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetStationReadingsHistoryHandler, type StationReadingsHistoryToolDeps } from './handler.js';
import {
  STATION_READINGS_HISTORY_MAX_HOURS,
  getStationReadingsHistoryInputSchema,
  stationReadingsHistoryOutputSchema,
} from './schema.js';

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
