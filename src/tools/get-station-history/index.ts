import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetStationHistoryHandler, type StationHistoryToolDeps } from './handler.js';
import { getStationHistoryInputSchema, stationHistoryOutputSchema } from './schema.js';

export function registerGetStationHistory(server: McpServer, deps: StationHistoryToolDeps): void {
  server.registerTool(
    'get_station_history',
    {
      title: 'Get daily PM2.5/weather rollup history for a station',
      description:
        'Daily rollup for a single station — one row per calendar day with mean PM2.5 (EPA AQI category attached), ' +
        "reading count, weather (wind formatted as compass labels, precipitation, humidity), and that day's " +
        'baseline stats (median/p25/p75, each with its own AQI category), where available. Requires a ' +
        '`station_id` from `get_stations` or `get_station_readings` — ' +
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
