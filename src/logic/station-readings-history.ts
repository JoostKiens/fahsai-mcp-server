import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { classifyAqiOrNull, type AqiCategory } from './aqi.js';

// Matches the live API's own cap on /api/station-readings/history — verified 2026-07-26
// (JOO-31): hours>168 is a 400 ("hours cannot exceed 168 (7 days)").
export const STATION_READINGS_HISTORY_MAX_HOURS = 168;

export interface StationReadingsHistoryToolDeps {
  readonly client: FahsaiClient;
}

// What /api/station-readings/history returns, wrapped as { data: StationReadingHistoryRaw[] } —
// verified 2026-07-26 (JOO-31). Leaner than /latest's shape: no stationName/lat/lng/country/
// attribution, just the series for the one station requested. The `parameter` query param is
// confirmed a no-op here too (byte-identical results for pm25/pm10/bogus/omitted against the
// same station+window) — same finding as /latest (JOO-30), so this server doesn't send it.
export interface StationReadingHistoryRaw {
  readonly stationId: string;
  readonly value: number;
  readonly measuredAt: string;
}

export interface StationReadingsHistoryApiResponse {
  readonly data: readonly StationReadingHistoryRaw[];
}

export interface StationReadingHistoryPoint {
  readonly measuredAt: string;
  readonly pm25: number;
  readonly aqiCategory: AqiCategory;
}

export interface StationReadingsHistorySummary {
  readonly stationId: string;
  readonly hoursRequested: number;
  readonly total: number;
  readonly readings: readonly StationReadingHistoryPoint[];
  readonly note?: string;
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

export const stationReadingsHistoryOutputSchema = z.object({
  stationId: z.string(),
  hoursRequested: z.number(),
  total: z.number(),
  readings: z.array(
    z.object({
      measuredAt: z.string(),
      pm25: z.number(),
      aqiCategory: z.string(),
    }),
  ),
  note: z.string().optional(),
});

export type StationReadingsHistoryToolResult = CallToolResult;
