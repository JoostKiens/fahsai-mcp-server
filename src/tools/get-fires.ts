import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatBboxParam } from '../logic/bbox.js';
import { locationInput, resolveLocationInput } from '../schemas/location.js';
import {
  FIRE_CONFIDENCE_VALUES,
  buildFiresToolError,
  buildFiresToolResponse,
  fireSummaryOutputSchema,
  summarizeFires,
  type FirePoint,
  type FireToolResult,
  type FiresToolDeps,
} from './fires.logic.js';

export const getFiresInputSchema = z.object({
  ...locationInput.shape,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'),
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
    const fetchResult = await deps.client.get<FirePoint[]>('/api/fires', {
      date: input.date,
      bbox: formatBboxParam(bbox),
      confidence: input.confidence?.join(','),
    });

    if (!fetchResult.ok) {
      if (fetchResult.error.kind === 'not-found') {
        return buildFiresToolResponse(
          { total: 0, byConfidence: { high: 0, nominal: 0, low: 0, unknown: 0 }, points: [], truncated: false },
          `No fire data ingested for ${input.date} yet.`,
        );
      }
      return buildFiresToolError(fetchResult.error.message);
    }

    return buildFiresToolResponse(summarizeFires(fetchResult.value), locationNote);
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
