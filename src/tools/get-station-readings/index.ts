import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetStationReadingsHandler, type StationReadingsToolDeps } from './handler.js';
import { getStationReadingsInputSchema, stationReadingsOutputSchema } from './schema.js';

export function registerGetStationReadings(server: McpServer, deps: StationReadingsToolDeps): void {
  server.registerTool(
    'get_station_readings',
    {
      title: 'Get latest station PM2.5 readings',
      description: `Latest PM2.5 ground-station measurements (OpenAQ) for a place or bounding box, each with an EPA AQI category. This is a measurement, not a model estimate — see \`get_cams\` for the gridded model instead. Per-station \`attribution\`, when present, carries source-specific requirements beyond the blanket OpenAQ CC BY 4.0 attribution and must not be dropped.`,
      inputSchema: getStationReadingsInputSchema.shape,
      outputSchema: stationReadingsOutputSchema.shape,
    },
    createGetStationReadingsHandler(deps),
  );
}
