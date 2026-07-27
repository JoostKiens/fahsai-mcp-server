import { formatBboxParam } from '../../shared/bbox.js';
import { fetchAndSummarizeFires, type FiresToolDeps } from '../../shared/fires/handler.js';
import type { FireToolResult } from '../../shared/fires/schema.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { buildToolError } from '../../shared/tool-response.js';
import type { GetFiresInput } from './schema.js';

export function createGetFiresHandler(deps: FiresToolDeps) {
  return async (input: GetFiresInput): Promise<FireToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    return fetchAndSummarizeFires(
      deps.client,
      '/api/fires',
      { date: input.date, bbox: formatBboxParam(bbox) },
      input.confidence,
      `No fire data ingested for ${input.date} yet.`,
      locationNote,
    );
  };
}
