import { formatBboxParam } from '../../shared/bbox.js';
import { validateDateRange } from '../../shared/date-range.js';
import { fetchAndSummarizeFires, type FiresToolDeps } from '../../shared/fires/handler.js';
import { FIRES_RANGE_MAX_DAYS, type FireToolResult } from '../../shared/fires/schema.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { buildToolError } from '../../shared/tool-response.js';
import type { GetFiresRangeInput } from './schema.js';

export function createGetFiresRangeHandler(deps: FiresToolDeps) {
  return async (input: GetFiresRangeInput): Promise<FireToolResult> => {
    const rangeCheck = validateDateRange(input.start, input.end, FIRES_RANGE_MAX_DAYS, 'get_fires_range');
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
