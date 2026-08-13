import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { FahsaiClient, FahsaiQueryParams } from './fahsai-client/client.js';
import { buildToolError, buildToolResponse } from './tool-response.js';

interface FetchAndSummarizeOptions<TRaw, TSummary extends { readonly note?: string }> {
  // Pulls the raw shape this tool cares about out of the (unvalidated) parsed JSON body —
  // fahsai-client casts straight to T with no runtime check, so this is also where a tool
  // guards against a malformed/renamed/missing field, degrading to an empty value instead of
  // throwing downstream (see e.g. get-cams's guardCamsGrid).
  readonly extractData: (body: unknown) => TRaw;
  readonly summarize: (raw: TRaw) => TSummary;
  readonly emptySummary: TSummary;
  readonly notFoundNote: string;
  readonly locationNote?: string;
}

// Shared fetch -> 404-handling -> summarize -> respond sequence used by every bbox/date-scoped
// tool (get_fires, get_fires_range, get_weather, get_cams) — a change to this sequence (e.g.
// how notes get merged) only has to happen once instead of once per tool.
export async function fetchAndSummarize<TRaw, TSummary extends { readonly note?: string }>(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
  options: FetchAndSummarizeOptions<TRaw, TSummary>,
): Promise<CallToolResult> {
  const fetchResult = await client.get(path, params);

  if (!fetchResult.ok) {
    if (fetchResult.error.kind === 'not-found') {
      return buildToolResponse(options.emptySummary, options.locationNote, options.notFoundNote);
    }
    return buildToolError(fetchResult.error.message);
  }

  const raw = options.extractData(fetchResult.value);
  return buildToolResponse(options.summarize(raw), options.locationNote);
}
