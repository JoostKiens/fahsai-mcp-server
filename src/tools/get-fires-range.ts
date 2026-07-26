import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatBboxParam } from '../logic/bbox.js';
import type { Result } from '../result.js';
import { locationInput, resolveLocationInput } from '../schemas/location.js';
import { FIRES_RANGE_MAX_DAYS } from './fires.constants.js';
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be in YYYY-MM-DD format');

export const getFiresRangeInputSchema = z.object({
  ...locationInput.shape,
  start: dateSchema,
  end: dateSchema,
  confidence: z.array(z.enum(FIRE_CONFIDENCE_VALUES)).optional(),
});

export type GetFiresRangeInput = z.infer<typeof getFiresRangeInputSchema>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseUtcDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Cross-field validation the MCP SDK's per-field inputSchema can't express — runs before
// any network call, per the 10-day cap this server enforces client-side.
export function validateFiresRange(start: string, end: string): Result<void, string> {
  const startDate = parseUtcDate(start);
  if (startDate === null) {
    return { ok: false, error: `"${start}" is not a valid calendar date.` };
  }

  const endDate = parseUtcDate(end);
  if (endDate === null) {
    return { ok: false, error: `"${end}" is not a valid calendar date.` };
  }

  if (endDate.getTime() < startDate.getTime()) {
    return { ok: false, error: '`end` must not be before `start`.' };
  }

  const days = Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
  if (days > FIRES_RANGE_MAX_DAYS) {
    return {
      ok: false,
      error: `Date range spans ${days} days; get_fires_range allows a maximum of ${FIRES_RANGE_MAX_DAYS} days. Narrow the range and try again.`,
    };
  }

  return { ok: true, value: undefined };
}

export function createGetFiresRangeHandler(deps: FiresToolDeps) {
  return async (input: GetFiresRangeInput): Promise<FireToolResult> => {
    const rangeCheck = validateFiresRange(input.start, input.end);
    if (!rangeCheck.ok) {
      return buildFiresToolError(rangeCheck.error);
    }

    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildFiresToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    const fetchResult = await deps.client.get<FirePoint[]>('/api/fires/range', {
      start: input.start,
      end: input.end,
      bbox: formatBboxParam(bbox),
      confidence: input.confidence?.join(','),
    });

    if (!fetchResult.ok) {
      if (fetchResult.error.kind === 'not-found') {
        return buildFiresToolResponse(
          { total: 0, byConfidence: { high: 0, nominal: 0, low: 0, unknown: 0 }, points: [], truncated: false },
          `No fire data ingested for ${input.start}–${input.end} yet.`,
        );
      }
      return buildFiresToolError(fetchResult.error.message);
    }

    return buildFiresToolResponse(summarizeFires(fetchResult.value), locationNote);
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
