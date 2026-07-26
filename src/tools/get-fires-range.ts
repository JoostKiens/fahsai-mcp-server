import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatBboxParam } from '../logic/bbox.js';
import {
  FIRES_RANGE_MAX_DAYS,
  FIRE_CONFIDENCE_VALUES,
  fetchAndSummarizeFires,
  fireSummaryOutputSchema,
  validateFiresRange,
  type FireToolResult,
  type FiresToolDeps,
} from '../logic/fires.js';
import { buildToolError } from '../logic/tool-response.js';
import { isoDateSchema } from '../schemas/date.js';
import { locationInput, resolveLocationInput } from '../schemas/location.js';

export const getFiresRangeInputSchema = z.object({
  ...locationInput.shape,
  start: isoDateSchema,
  end: isoDateSchema,
  confidence: z.array(z.enum(FIRE_CONFIDENCE_VALUES)).optional(),
});

export type GetFiresRangeInput = z.infer<typeof getFiresRangeInputSchema>;

export function createGetFiresRangeHandler(deps: FiresToolDeps) {
  return async (input: GetFiresRangeInput): Promise<FireToolResult> => {
    const rangeCheck = validateFiresRange(input.start, input.end);
    if (!rangeCheck.ok) {
      return buildToolError(rangeCheck.error);
    }

    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    return fetchAndSummarizeFires(
      deps.client,
      '/api/fires/range',
      { start: input.start, end: input.end, bbox: formatBboxParam(bbox) },
      input.confidence,
      `No fire data ingested for ${input.start}–${input.end} yet.`,
      locationNote,
    );
  };
}

export function registerGetFiresRange(server: McpServer, deps: FiresToolDeps): void {
  server.registerTool(
    'get_fires_range',
    {
      title: 'Get active fires over a date range',
      description:
        `Active fire detections (NASA FIRMS) across a date range (max ${FIRES_RANGE_MAX_DAYS} days), filtered by ` +
        'place name or bounding box. Use the `confidence` filter (`low`/`nominal`/`high`) to cut FIRMS noise — this ' +
        'is the field for that, not FRP. Returns a total count, a confidence breakdown, and either the full point ' +
        'list or the top fires by fire radiative power (FRP) when the result is large.',
      inputSchema: getFiresRangeInputSchema.shape,
      outputSchema: fireSummaryOutputSchema.shape,
    },
    createGetFiresRangeHandler(deps),
  );
}
