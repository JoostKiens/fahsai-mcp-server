import { classifyAqiOrNull } from '../../shared/aqi.js';
import { asArray } from '../../shared/as-array.js';
import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import type {
  GetStationReadingsHistoryInput,
  StationReadingHistoryPoint,
  StationReadingsHistorySummary,
  StationReadingsHistoryToolResult,
} from './schema.js';

export interface StationReadingsHistoryToolDeps {
  readonly client: FahsaiClient;
}

// What /api/station-readings/history returns, wrapped as { data: StationReadingHistoryRaw[] } —
// verified 2026-07-26 (JOO-31). Leaner than /latest's shape: no stationName/lat/lng/country/
// attribution, just the series for the one station requested. The `parameter` query param is
// confirmed a no-op here too (byte-identical results for pm25/pm10/bogus/omitted against the
// same station+window) — same finding as /latest (JOO-30), so it's neither exposed on this
// tool's input schema nor sent to the API.
export interface StationReadingHistoryRaw {
  readonly stationId: string;
  readonly value: number;
  readonly measuredAt: string;
}

export interface StationReadingsHistoryApiResponse {
  readonly data: readonly StationReadingHistoryRaw[];
}

function toStationReadingHistoryPoint(raw: StationReadingHistoryRaw): StationReadingHistoryPoint | null {
  const result = classifyAqiOrNull(raw.value);
  if (result === null) return null;

  return { measuredAt: raw.measuredAt, pm25: result.pm25, aqiCategory: result.category };
}

// No truncation/bucketing — mcp-tools.md's "no raw large arrays" rule explicitly exempts
// station-shaped lists, and this endpoint's own 168-hour cap already bounds the series to at
// most 168 points (observed live data is daily-cadence, so real series are far shorter).
export function summarizeStationReadingsHistory(
  raw: readonly StationReadingHistoryRaw[],
  stationId: string,
  hoursRequested: number,
): StationReadingsHistorySummary {
  const readings: StationReadingHistoryPoint[] = [];
  let omitted = 0;

  for (const entry of raw) {
    const point = toStationReadingHistoryPoint(entry);
    if (point === null) {
      omitted += 1;
      continue;
    }
    readings.push(point);
  }

  return {
    stationId,
    hoursRequested,
    total: readings.length,
    readings,
    note: omitted > 0 ? `${omitted} reading(s) omitted for an invalid PM2.5 value.` : undefined,
  };
}

export function emptyStationReadingsHistorySummary(
  stationId: string,
  hoursRequested: number,
): StationReadingsHistorySummary {
  return { stationId, hoursRequested, total: 0, readings: [] };
}

function noDataNote(stationId: string, hours: number): string {
  return (
    `No PM2.5 readings found for station ${stationId} in the last ${hours}h — the station_id ` +
    'may be invalid (see get_stations), or data may not be ingested for this window yet.'
  );
}

export function createGetStationReadingsHistoryHandler(deps: StationReadingsHistoryToolDeps) {
  return async (
    input: GetStationReadingsHistoryInput,
  ): Promise<StationReadingsHistoryToolResult> => {
    const fetchResult = await deps.client.get<StationReadingsHistoryApiResponse>(
      '/api/station-readings/history',
      { station_id: input.station_id, hours: input.hours },
    );

    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    const data = asArray<StationReadingHistoryRaw>(fetchResult.value.data);

    if (data.length === 0) {
      return buildToolResponse(
        emptyStationReadingsHistorySummary(input.station_id, input.hours),
        noDataNote(input.station_id, input.hours),
      );
    }

    return buildToolResponse(summarizeStationReadingsHistory(data, input.station_id, input.hours));
  };
}
