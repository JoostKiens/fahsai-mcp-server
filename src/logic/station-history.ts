import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { classifyAqiOrNull, type AqiCategory } from './aqi.js';
import { parseWindDirOrNull, type WindDir } from './wind.js';

// Matches the live API's own cap on /api/stations/:id/history — verified 2026-07-26 (JOO-32):
// days>30 is a 400 ("days cannot exceed 30"). Default (no `days` param) is 7.
export const STATION_HISTORY_MAX_DAYS = 30;
export const STATION_HISTORY_DEFAULT_DAYS = 7;

export interface StationHistoryToolDeps {
  readonly client: FahsaiClient;
}

// What /api/stations/:id/history returns, wrapped as { stationId, days: StationHistoryDayRaw[] } —
// verified 2026-07-26 (JOO-32). `pm25: 0` paired with `readingCount: 0` is a sentinel for "no
// reading ingested that day" (confirmed live: a bogus station_id returns this pair for every day),
// not a real zero reading — see toStationHistoryDay below.
export interface StationHistoryWeatherRaw {
  readonly windSpeedKmh: number | null;
  readonly windDirectionDeg: number | null;
  readonly precipitationSumMm: number | null;
  readonly relativeHumidity2m: number | null;
}

export interface StationHistoryBaselineRaw {
  readonly medianPm25: number;
  readonly p25Pm25: number;
  readonly p75Pm25: number;
  readonly n: number;
}

export interface StationHistoryDayRaw {
  readonly date: string;
  readonly pm25: number;
  readonly readingCount: number;
  readonly weather: StationHistoryWeatherRaw | null;
  readonly baseline: StationHistoryBaselineRaw | null;
}

export interface StationHistoryApiResponse {
  readonly stationId: string;
  readonly days: readonly StationHistoryDayRaw[];
}

export interface StationHistoryWeather {
  readonly windSpeedKmh: number | null;
  readonly precipitationSumMm: number | null;
  readonly relativeHumidity2m: number | null;
  readonly wind: WindDir | null;
}

// CLAUDE.md's non-negotiable constraint applies to every PM2.5 value, including the per-day
// baseline stats embedded here — median/p25/p75 each get their own category, not just medianPm25.
export interface StationHistoryBaseline {
  readonly medianPm25: number;
  readonly medianAqiCategory: AqiCategory | null;
  readonly p25Pm25: number;
  readonly p25AqiCategory: AqiCategory | null;
  readonly p75Pm25: number;
  readonly p75AqiCategory: AqiCategory | null;
  readonly n: number;
}

export interface StationHistoryDay {
  readonly date: string;
  readonly pm25: number | null;
  readonly aqiCategory: AqiCategory | null;
  readonly readingCount: number;
  readonly weather: StationHistoryWeather | null;
  readonly baseline: StationHistoryBaseline | null;
}

export interface StationHistorySummary {
  readonly stationId: string;
  readonly daysRequested: number;
  readonly days: readonly StationHistoryDay[];
  readonly note?: string;
}

function toStationHistoryWeather(raw: StationHistoryWeatherRaw): StationHistoryWeather {
  return {
    windSpeedKmh: raw.windSpeedKmh,
    precipitationSumMm: raw.precipitationSumMm,
    relativeHumidity2m: raw.relativeHumidity2m,
    // parseWindDirOrNull, not parseWindDir directly — a non-finite windDirectionDeg from an
    // unvalidated JSON body would otherwise throw and abort the whole get_station_history call.
    wind: raw.windDirectionDeg !== null ? parseWindDirOrNull(raw.windDirectionDeg) : null,
  };
}

function toStationHistoryBaseline(raw: StationHistoryBaselineRaw): StationHistoryBaseline {
  return {
    medianPm25: raw.medianPm25,
    medianAqiCategory: classifyAqiOrNull(raw.medianPm25)?.category ?? null,
    p25Pm25: raw.p25Pm25,
    p25AqiCategory: classifyAqiOrNull(raw.p25Pm25)?.category ?? null,
    p75Pm25: raw.p75Pm25,
    p75AqiCategory: classifyAqiOrNull(raw.p75Pm25)?.category ?? null,
    n: raw.n,
  };
}

function toStationHistoryDay(raw: StationHistoryDayRaw): StationHistoryDay {
  // readingCount:0 pairs with a sentinel pm25:0 meaning "no reading ingested" — never classify it.
  const aqi = raw.readingCount === 0 ? null : classifyAqiOrNull(raw.pm25);

  return {
    date: raw.date,
    pm25: aqi?.pm25 ?? null,
    aqiCategory: aqi?.category ?? null,
    readingCount: raw.readingCount,
    // Guarded against `undefined`, not just `null` — fahsai-client casts parsed JSON straight to
    // T with no runtime check, so a response that omits the key entirely (rather than sending an
    // explicit null) is a real possibility, and `!== null` alone would let `undefined` through to
    // toStationHistoryWeather/toStationHistoryBaseline and throw inside this function's caller (.map).
    weather: raw.weather !== null && raw.weather !== undefined ? toStationHistoryWeather(raw.weather) : null,
    baseline:
      raw.baseline !== null && raw.baseline !== undefined ? toStationHistoryBaseline(raw.baseline) : null,
  };
}

// No truncation — mcp-tools.md's "no raw large arrays" rule exempts station-shaped lists, and
// this endpoint's own 30-day cap already bounds the series.
export function summarizeStationHistory(
  raw: readonly StationHistoryDayRaw[],
  stationId: string,
  daysRequested: number,
): StationHistorySummary {
  return {
    stationId,
    daysRequested,
    days: raw.map(toStationHistoryDay),
  };
}

export function emptyStationHistorySummary(stationId: string, daysRequested: number): StationHistorySummary {
  return { stationId, daysRequested, days: [] };
}

const stationHistoryWeatherOutputSchema = z.object({
  windSpeedKmh: z.number().nullable(),
  precipitationSumMm: z.number().nullable(),
  relativeHumidity2m: z.number().nullable(),
  wind: z
    .object({
      fromLabel: z.string(),
      toLabel: z.string(),
      fromQuadrant: z.string(),
      toQuadrant: z.string(),
    })
    .nullable(),
});

const stationHistoryBaselineOutputSchema = z.object({
  medianPm25: z.number(),
  medianAqiCategory: z.string().nullable(),
  p25Pm25: z.number(),
  p25AqiCategory: z.string().nullable(),
  p75Pm25: z.number(),
  p75AqiCategory: z.string().nullable(),
  n: z.number(),
});

export const stationHistoryOutputSchema = z.object({
  stationId: z.string(),
  daysRequested: z.number(),
  days: z.array(
    z.object({
      date: z.string(),
      pm25: z.number().nullable(),
      aqiCategory: z.string().nullable(),
      readingCount: z.number(),
      weather: stationHistoryWeatherOutputSchema.nullable(),
      baseline: stationHistoryBaselineOutputSchema.nullable(),
    }),
  ),
  note: z.string().optional(),
});

export type StationHistoryToolResult = CallToolResult;
