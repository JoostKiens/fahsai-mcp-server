import { formatBboxParam } from '../../shared/bbox.js';
import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import type { GetStationsInput, StationRaw, StationsSummary, StationsToolResult } from './schema.js';

export interface StationsToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

export interface StationsApiResponse {
  readonly data: readonly StationRaw[];
}

// No truncation and nothing to classify — station lists are bounded by the physical sensor
// network, not event volume (mcp-tools.md's exception), and this endpoint carries no PM2.5 value.
export function summarizeStations(raw: readonly StationRaw[]): StationsSummary {
  return { total: raw.length, stations: raw };
}

export function createGetStationsHandler(deps: StationsToolDeps) {
  return async (input: GetStationsInput): Promise<StationsToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    const fetchResult = await deps.client.get<StationsApiResponse>('/api/stations', {
      bbox: formatBboxParam(bbox),
    });

    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    // fahsai-client casts the parsed JSON straight to T with no runtime check — guard against
    // a malformed success body (e.g. a bare `null`, or a `data` field that's missing/renamed)
    // instead of letting `.data` access or downstream array methods throw. A bbox with
    // genuinely zero stations is a normal, common result (verified live), so this is
    // deliberately silent rather than attaching a "may be malformed" note — unlike
    // get-station-history, where an empty result is never a valid response on its own.
    const data = Array.isArray(fetchResult.value?.data) ? fetchResult.value.data : [];

    return buildToolResponse(summarizeStations(data), locationNote);
  };
}
