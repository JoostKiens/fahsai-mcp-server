import { classifyAqiOrNull } from '../../shared/aqi.js';
import { asArray } from '../../shared/as-array.js';
import { formatBboxParam } from '../../shared/bbox.js';
import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { resolveDateOrLatest } from '../../shared/latest-date.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import type {
  StationReadingLatestRaw,
  StationReadingsApiResponse,
} from '../../shared/station-readings.js';
import { summarizeValidReadings } from '../../shared/summarize-valid-readings.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import type {
  GetStationReadingsInput,
  StationReadingSummary,
  StationReadingsSummary,
  StationReadingsToolResult,
} from './schema.js';

export interface StationReadingsToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// Re-exported for existing consumers (e.g. this tool's own live test) — the raw shape now
// lives in shared/station-readings.ts since shared/nearest-station is a second consumer.
export type { StationReadingLatestRaw, StationReadingsApiResponse };

function toStationReadingSummary(raw: StationReadingLatestRaw): StationReadingSummary | null {
  const result = classifyAqiOrNull(raw.value);
  if (result === null) return null;

  const summary: StationReadingSummary = {
    stationId: raw.stationId,
    stationName: raw.stationName,
    lat: raw.lat,
    lng: raw.lng,
    country: raw.country,
    measuredAt: raw.measuredAt,
    pm25: result.pm25,
    aqiCategory: result.category,
  };
  return raw.attribution !== undefined ? { ...summary, attribution: raw.attribution } : summary;
}

// No truncation, unlike summarizeFires — station lists are bounded by the physical sensor
// network (a few hundred stations at most for the full SEA bbox), not by event volume, so
// the project's "no raw large arrays" rule (mcp-tools.md) doesn't apply here.
export function summarizeStationReadings(
  raw: readonly StationReadingLatestRaw[],
): StationReadingsSummary {
  const { items, note } = summarizeValidReadings(raw, toStationReadingSummary, 'station reading');
  return { total: items.length, readings: items, note };
}

export function emptyStationReadingsSummary(): StationReadingsSummary {
  return { total: 0, readings: [] };
}

// The live API 404s for both "no stations in this bbox" and "not ingested yet for this
// date" with the same message — this covers both, and (defensively) a 200 with an empty
// `data` array, in case that ever changes.
function noDataNote(date: string): string {
  return `No station readings available for ${date}.`;
}

export function createGetStationReadingsHandler(deps: StationReadingsToolDeps) {
  return async (input: GetStationReadingsInput): Promise<StationReadingsToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;

    // /api/station-readings/latest 404s when `date` is omitted instead of falling back to
    // a rolling window (verified 2026-08-02, JOO-38) — resolve a real date first so "no date
    // given" actually returns the latest available readings instead of a spurious empty result.
    const dateResult = await resolveDateOrLatest(deps.client, input.date);
    if (!dateResult.ok) {
      return buildToolError(dateResult.error.message);
    }
    const date = dateResult.value;

    const fetchResult = await deps.client.get<StationReadingsApiResponse>(
      '/api/station-readings/latest',
      { bbox: formatBboxParam(bbox), date },
    );

    if (!fetchResult.ok) {
      if (fetchResult.error.kind === 'not-found') {
        return buildToolResponse(emptyStationReadingsSummary(), locationNote, noDataNote(date));
      }
      return buildToolError(fetchResult.error.message);
    }

    // Guard against a malformed success body (missing/renamed `data`) instead of letting
    // downstream indexing throw — fahsai-client casts JSON to T with no runtime check.
    const data = asArray<StationReadingLatestRaw>(fetchResult.value?.data);
    if (data.length === 0) {
      return buildToolResponse(emptyStationReadingsSummary(), locationNote, noDataNote(date));
    }

    return buildToolResponse(summarizeStationReadings(data), locationNote);
  };
}
