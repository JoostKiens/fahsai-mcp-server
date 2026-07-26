import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatBboxParam } from '../logic/bbox.js';
import {
  FIRE_CONFIDENCE_VALUES,
  buildFiresToolError,
  fetchAndSummarizeFires,
  fireDateSchema,
  fireSummaryOutputSchema,
  formatConfidenceParam,
  type FireToolResult,
  type FiresToolDeps,
} from '../logic/fires.js';
import { locationInput, resolveLocationInput } from '../schemas/location.js';

export const getFiresInputSchema = z.object({
  ...locationInput.shape,
  date: fireDateSchema,
  confidence: z.array(z.enum(FIRE_CONFIDENCE_VALUES)).optional(),
});

export type GetFiresInput = z.infer<typeof getFiresInputSchema>;

export function createGetFiresHandler(deps: FiresToolDeps) {
  return async (input: GetFiresInput): Promise<FireToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildFiresToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    return fetchAndSummarizeFires(
      deps.client,
      '/api/fires',
      { date: input.date, bbox: formatBboxParam(bbox), confidence: formatConfidenceParam(input.confidence) },
      `No fire data ingested for ${input.date} yet.`,
      locationNote,
    );
  };
}

export function registerGetFires(server: McpServer, deps: FiresToolDeps): void {
  server.registerTool(
    'get_fires',
    {
      title: 'Get active fires',
      description:
        'Active fire detections (NASA FIRMS) for a single date, filtered by place name or bounding box. ' +
        'Use the `confidence` filter (`low`/`nominal`/`high`) to cut FIRMS noise — this is the field for that, not FRP. ' +
        'Returns a total count, a confidence breakdown, and either the full point list or the top fires by fire ' +
        'radiative power (FRP) when the result is large.',
      inputSchema: getFiresInputSchema.shape,
      outputSchema: fireSummaryOutputSchema.shape,
    },
    createGetFiresHandler(deps),
  );
}
