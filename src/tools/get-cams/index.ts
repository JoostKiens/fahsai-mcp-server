import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetCamsHandler, type CamsToolDeps } from './handler.js';
import { camsSummaryOutputSchema, getCamsInputSchema } from './schema.js';

export function registerGetCams(server: McpServer, deps: CamsToolDeps): void {
  server.registerTool(
    'get_cams',
    {
      title: 'Get CAMS PM2.5 grid',
      description:
        'Gridded PM2.5 estimates from the CAMS atmospheric model (via Open-Meteo) for a single date, filtered ' +
        'by place name or bounding box — this is a MODEL ESTIMATE, not a ground-station measurement (see ' +
        "get_station_readings for actual measured values; don't conflate the two). By default returns an area " +
        'summary (mean, median, and p95 PM2.5 across the grid, each with its own AQI category), not the raw ' +
        'grid — set `include_raw_grid` to also get individual grid points (evenly, spatially sampled; capped ' +
        'at 500 points even when requested, with a note if the grid was truncated). Omitting both `place` and ' +
        '`bbox` summarizes the full four-country coverage area, not any one place.',
      inputSchema: getCamsInputSchema.shape,
      outputSchema: camsSummaryOutputSchema.shape,
    },
    createGetCamsHandler(deps),
  );
}
