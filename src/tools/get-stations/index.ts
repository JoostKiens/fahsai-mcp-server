import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetStationsHandler, type StationsToolDeps } from './handler.js';
import { getStationsInputSchema, stationsOutputSchema } from './schema.js';

export function registerGetStations(server: McpServer, deps: StationsToolDeps): void {
  server.registerTool(
    'get_stations',
    {
      title: 'Get monitoring stations for a location',
      description: `All PM2.5 ground-monitoring stations (OpenAQ) for a place or bounding box, with id, name, coordinates, country, and provider. This is the way to discover the \`station_id\` values needed by \`get_station_readings_history\`, \`get_station_history\`, and \`get_station_baseline\` — call this first to find a station near a location, then pass its \`id\` as \`station_id\` to those tools. \`name\` does a case-insensitive substring match on station name; combined with \`place\`/\`bbox\` it narrows within that area, used alone it searches Fahsai's full coverage area.`,
      inputSchema: getStationsInputSchema.shape,
      outputSchema: stationsOutputSchema.shape,
    },
    createGetStationsHandler(deps),
  );
}
