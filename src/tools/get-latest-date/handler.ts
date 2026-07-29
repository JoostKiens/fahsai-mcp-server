import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import { LATEST_DATE_GATING_NOTE, type LatestDateToolResult } from './schema.js';

export interface LatestDateToolDeps {
  readonly client: FahsaiClient;
}

// Bare { date }, no per-source breakdown — verified 2026-07-29, JOO-36 (see
// fahsai-api-reference.md).
export interface LatestDateApiResponse {
  readonly date: string;
}

export function createGetLatestDateHandler(deps: LatestDateToolDeps) {
  return async (): Promise<LatestDateToolResult> => {
    const fetchResult = await deps.client.get<LatestDateApiResponse>('/api/latest-date');
    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    if (typeof fetchResult.value?.date !== 'string') {
      return buildToolError('Fahsai API returned an unexpected /api/latest-date response.');
    }

    return buildToolResponse({ date: fetchResult.value.date, note: LATEST_DATE_GATING_NOTE });
  };
}
