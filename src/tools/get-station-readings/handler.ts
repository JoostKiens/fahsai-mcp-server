import { classifyAqiOrNull } from '../../shared/aqi.js';
import { formatBboxParam } from '../../shared/bbox.js';
import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import type { GetStationReadingsInput, StationReadingSummary, StationReadingsSummary, StationReadingsToolResult } from './schema.js';

export interface StationReadingsToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// What /api/station-readings/latest returns, wrapped as { data: StationReadingLatestRaw[] } —
// verified 2026-07-26 (JOO-30) against the live API, 303 stations across the full SEA bbox.
// `attribution` was never observed on any live station — it's kept here (and typed loosely,
// not assumed to be a string) because fahsai-api-reference.md's "known upstream gotchas"
// section documents it as a real, if rare, per-station OpenAQ quirk that must be passed
// through when present, not dropped.
export interface StationReadingLatestRaw {
  readonly stationId: string;
  readonly stationName: string;
  readonly lat: number;
  readonly lng: number;
  readonly country: string;
  readonly value: number;
  readonly measuredAt: string;
  readonly attribution?: unknown;
}

export interface StationReadingsApiResponse {
  readonly data: readonly StationReadingLatestRaw[];
}

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
  const readings: StationReadingSummary[] = [];
  let omitted = 0;

  for (const entry of raw) {
    const summary = toStationReadingSummary(entry);
    if (summary === null) {
      omitted += 1;
      continue;
    }
    readings.push(summary);
  }

  return {
    total: readings.length,
    readings,
    note:
      omitted > 0 ? `${omitted} station reading(s) omitted for an invalid PM2.5 value.` : undefined,
  };
}

export function emptyStationReadingsSummary(): StationReadingsSummary {
  return { total: 0, readings: [] };
}

// The live API 404s for both "no stations in this bbox" and "not ingested yet for this
// date" with the same message — this covers both, and (defensively) a 200 with an empty
// `data` array, in case that ever changes.
function noDataNote(date?: string): string {
  return date
    ? `No station readings available for ${date}.`
    : 'No station readings currently available for this location.';
}

export function createGetStationReadingsHandler(deps: StationReadingsToolDeps) {
  return async (input: GetStationReadingsInput): Promise<StationReadingsToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    const fetchResult = await deps.client.get<StationReadingsApiResponse>(
      '/api/station-readings/latest',
      {
        bbox: formatBboxParam(bbox),
        date: input.date,
      },
    );

    if (!fetchResult.ok) {
      if (fetchResult.error.kind === 'not-found') {
        return buildToolResponse(
          emptyStationReadingsSummary(),
          locationNote,
          noDataNote(input.date),
        );
      }
      return buildToolError(fetchResult.error.message);
    }

    if (fetchResult.value.data.length === 0) {
      return buildToolResponse(emptyStationReadingsSummary(), locationNote, noDataNote(input.date));
    }

    return buildToolResponse(summarizeStationReadings(fetchResult.value.data), locationNote);
  };
}
