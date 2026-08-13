import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetLatestDateHandler, type LatestDateToolDeps } from './handler.js';
import { getLatestDateInputSchema, latestDateOutputSchema } from './schema.js';

export function registerGetLatestDate(server: McpServer, deps: LatestDateToolDeps): void {
  server.registerTool(
    'get_latest_date',
    {
      title: 'Get latest complete-data date',
      description:
        'The most recent date with complete data across fires, CAMS, and ground station readings. Call this ' +
        'first when a caller means "today"/"latest" without a specific date — a 404 from `get_fires`, ' +
        '`get_weather`, or `get_cams` on a bare "today" often just means that date hasn\'t finished ingesting ' +
        'yet, not that no data exists.',
      inputSchema: getLatestDateInputSchema.shape,
      outputSchema: latestDateOutputSchema.shape,
    },
    createGetLatestDateHandler(deps),
  );
}
