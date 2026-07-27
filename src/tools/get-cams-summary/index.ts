import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetCamsSummaryHandler, type CamsSummaryToolDeps } from './handler.js';
import {
  CAMS_SUMMARY_RANGE_MAX_DAYS,
  camsSummarySeriesOutputSchema,
  getCamsSummaryInputSchema,
} from './schema.js';

export function registerGetCamsSummary(server: McpServer, deps: CamsSummaryToolDeps): void {
  server.registerTool(
    'get_cams_summary',
    {
      title: 'Get CAMS PM2.5 daily summary',
      description:
        'Daily PM2.5 time series from the CAMS atmospheric model (via Open-Meteo) for a date range — this is a ' +
        'MODEL ESTIMATE, not a ground-station measurement (see get_station_readings for actual measured values; ' +
        "don't conflate the two). NATIONWIDE ONLY: this route has no place/bbox scoping on the Fahsai API side, " +
        'so do not pass a location to this tool — results always cover the full default coverage area. Each ' +
        `day's value is the CAMS daily p95 PM2.5, with its own AQI category. Max ${CAMS_SUMMARY_RANGE_MAX_DAYS} ` +
        'days per request (enforced client-side); narrow the range and retry if rejected.',
      inputSchema: getCamsSummaryInputSchema.shape,
      outputSchema: camsSummarySeriesOutputSchema.shape,
    },
    createGetCamsSummaryHandler(deps),
  );
}
