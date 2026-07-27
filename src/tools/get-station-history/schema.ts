import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { AqiCategory } from '../../shared/aqi.js';
import { isoDateSchema } from '../../shared/schema/date.js';
import type { WindDir } from '../../shared/wind.js';

// Matches the live API's own cap on /api/stations/:id/history — verified 2026-07-26 (JOO-32):
// days>30 is a 400 ("days cannot exceed 30"). Default (no `days` param) is 7.
export const STATION_HISTORY_MAX_DAYS = 30;
export const STATION_HISTORY_DEFAULT_DAYS = 7;

export const getStationHistoryInputSchema = z.object({
  station_id: z.string().min(1),
  days: z.number().int().positive().max(STATION_HISTORY_MAX_DAYS).default(STATION_HISTORY_DEFAULT_DAYS),
  date: isoDateSchema.optional(),
});

export type GetStationHistoryInput = z.infer<typeof getStationHistoryInputSchema>;

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
