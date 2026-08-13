import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { resolveDateOrLatest } from '../../shared/latest-date.js';
import { findNearestStation } from '../../shared/nearest-station/handler.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { buildIgnoredFieldsNote, resolveLocationInput } from '../../shared/resolve-location.js';
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

// station_id takes precedence over place/bbox/radius_km when both are somehow given (JOO-53) —
// never silently drop an input with no signal back to the caller, same convention
// resolveLocationInput already applies to place-vs-bbox.
function stationIdIgnoredNote(input: GetReadingExplanationInput): string | undefined {
  const ignoredFields: string[] = [];
  if (input.place) ignoredFields.push('`place`');
  if (input.bbox) ignoredFields.push('`bbox`');
  if (input.radius_km !== undefined) ignoredFields.push('`radius_km`');
  return buildIgnoredFieldsNote(ignoredFields, 'station_id');
}

export function createGetReadingExplanationHandler(deps: ReadingExplanationToolDeps) {
  return async (input: GetReadingExplanationInput): Promise<ReadingExplanationToolResult> => {
    // A known station_id is an exact match, taking precedence over place/bbox and skipping
    // resolveLocationInput entirely — no distance/cutoff logic applies (JOO-53).
    let locationNote: string | undefined;
    let stationResult: Awaited<ReturnType<typeof findNearestStation>>;
    let date = input.date;

    if (input.station_id !== undefined) {
      locationNote = stationIdIgnoredNote(input);
      // resolveByStationId never uses date — deferred until after this succeeds so an invalid
      // station_id fails fast without a wasted /api/latest-date round-trip.
      stationResult = await findNearestStation(deps.client, { stationId: input.station_id });
    } else {
      const locationResult = await resolveLocationInput(input, deps.placeResolver);
      if (!locationResult.ok) {
        return buildToolError(locationResult.error.message);
      }
      locationNote = locationResult.value.note;

      const dateResult = await resolveDateOrLatest(deps.client, date);
      if (!dateResult.ok) {
        return buildToolError(dateResult.error.message);
      }
      date = dateResult.value;

      stationResult = await findNearestStation(deps.client, { bbox: locationResult.value.bbox, date });
    }

    if (!stationResult.ok) {
      if (stationResult.error.kind === 'no-nearby-station' || stationResult.error.kind === 'station-not-found') {
        const summary: ReadingExplanationSummary = {};
        return buildToolResponse(summary, locationNote, stationResult.error.message);
      }
      return buildToolError(stationResult.error.message);
    }
    const { stationId, lat, lng } = stationResult.value;

    // Resolved once and reused for both the nearest-station lookup and this explain/context
    // call — otherwise each would independently default to "latest available date" server-side,
    // and those two defaults could disagree (e.g. today has no ingested reading yet).
    // resolveDateOrLatest is a no-op (no network call) once `date` is already known, so calling
    // it again here after the bbox-path branch above already resolved it costs nothing extra.
    const dateResult = await resolveDateOrLatest(deps.client, date);
    if (!dateResult.ok) {
      return buildToolError(dateResult.error.message);
    }
    date = dateResult.value;

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
