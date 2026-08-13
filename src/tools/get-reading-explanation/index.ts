import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createGetReadingExplanationHandler, type ReadingExplanationToolDeps } from './handler.js';
import { getReadingExplanationInputSchema, readingExplanationOutputSchema } from './schema.js';

export function registerGetReadingExplanation(
  server: McpServer,
  deps: ReadingExplanationToolDeps,
): void {
  server.registerTool(
    'get_reading_explanation',
    {
      title: 'Get a structured explanation for a station PM2.5 reading',
      description:
        'Structured scientific context (transport trajectory, upwind fire pressure, peer stations, 7-day trend, ' +
        "seasonal baseline) for the nearest station's PM2.5 reading near a place or bounding box, for reasoning " +
        'about *why* a reading looks the way it does. If `station_id` is given (e.g. from a prior get_stations or ' +
        'get_station_history call), it is used as an exact match with no distance/cutoff logic, taking precedence ' +
        'over `place`/`bbox` if both are somehow given. This is not a pre-written explanation — it is data for the ' +
        'calling LLM to reason over. Several fields are conditionally null, not missing data: `transport` is null ' +
        'for OUTLIER_HIGH/OUTLIER_LOW `explainCase` values (an outlier reading has no plausible transport path by ' +
        'definition); `stationBaseline` is null when the reading is unremarkable for the season; `trend` is null ' +
        'when there is not enough history; `peers`/`outlier` are null depending on data availability. Do not treat ' +
        'any of these nulls as a bug — they are meaningful signal.',
      inputSchema: getReadingExplanationInputSchema.shape,
      outputSchema: readingExplanationOutputSchema.shape,
    },
    createGetReadingExplanationHandler(deps),
  );
}
