import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { fetchLatestDate } from '../../shared/latest-date.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import { LATEST_DATE_GATING_NOTE, type LatestDateToolResult } from './schema.js';

export interface LatestDateToolDeps {
  readonly client: FahsaiClient;
}

// Re-exported for existing consumers (e.g. this tool's own live test) — the fetch itself
// now lives in shared/latest-date.ts since get-station-readings and shared/nearest-station
// are also consumers.
export type { LatestDateApiResponse } from '../../shared/latest-date.js';

export function createGetLatestDateHandler(deps: LatestDateToolDeps) {
  return async (): Promise<LatestDateToolResult> => {
    const dateResult = await fetchLatestDate(deps.client);
    if (!dateResult.ok) {
      return buildToolError(dateResult.error.message);
    }

    return buildToolResponse({ date: dateResult.value, note: LATEST_DATE_GATING_NOTE });
  };
}
