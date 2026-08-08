import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { fetchLatestDate } from '../../shared/latest-date.js';
import { findNearestStation } from '../../shared/nearest-station/handler.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import type { GetReadingExplanationInput, ReadingExplanationToolResult, ScientificContext } from './schema.js';

export interface ReadingExplanationToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// Every field optional so this same shape covers both a full ScientificContext (success) and
// the empty, note-only not-found responses — matches the output schema's "all optional" design.
type ReadingExplanationSummary = Partial<ScientificContext> & { readonly note?: string };

function noReadingNote(stationId: string, date: string): string {
  return `No reading explanation available for station ${stationId} on ${date}.`;
}

export function createGetReadingExplanationHandler(deps: ReadingExplanationToolDeps) {
  return async (input: GetReadingExplanationInput): Promise<ReadingExplanationToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }
    const { bbox, note: locationNote } = locationResult.value;

    // Resolved once and reused for both the nearest-station lookup and the explain/context call
    // below — otherwise each would independently default to "latest available date" server-side,
    // and those two defaults could disagree (e.g. today has no ingested reading yet).
    let date = input.date;
    if (date === undefined) {
      const latestDateResult = await fetchLatestDate(deps.client);
      if (!latestDateResult.ok) {
        return buildToolError(latestDateResult.error.message);
      }
      date = latestDateResult.value;
    }

    const stationResult = await findNearestStation(deps.client, bbox, date);
    if (!stationResult.ok) {
      if (stationResult.error.kind === 'no-nearby-station') {
        const summary: ReadingExplanationSummary = {};
        return buildToolResponse(summary, locationNote, stationResult.error.message);
      }
      return buildToolError(stationResult.error.message);
    }
    const { stationId, lat, lng } = stationResult.value;

    const fetchResult = await deps.client.get<ScientificContext>('/api/explain/context', {
      stationId,
      lat,
      lng,
      date,
    });

    if (!fetchResult.ok) {
      if (fetchResult.error.kind === 'not-found') {
        const summary: ReadingExplanationSummary = {};
        return buildToolResponse(summary, locationNote, noReadingNote(stationId, date));
      }
      return buildToolError(fetchResult.error.message);
    }

    // No reshaping — buildScientificContext already tiers/caps/formats everything server-side.
    return buildToolResponse<ReadingExplanationSummary>(fetchResult.value, locationNote);
  };
}
