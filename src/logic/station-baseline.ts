import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { classifyAqiOrNull, type AqiCategory } from './aqi.js';

// Fahsai frontend's season convention, keyed off UTC month — kept in sync manually since this
// server has no shared package with the frontend.
export type Season = 'peak_burning' | 'early_dry' | 'monsoon';

const SEASON_MONTHS: Record<Season, readonly number[]> = {
  peak_burning: [2, 3, 4],
  early_dry: [10, 11, 12, 1],
  monsoon: [5, 6, 7, 8, 9],
};

export function getSeason(date: string): Season {
  const month = new Date(date).getUTCMonth() + 1;
  if (month >= 2 && month <= 4) return 'peak_burning';
  if (month >= 10 || month <= 1) return 'early_dry';
  return 'monsoon';
}

// Match Fahsai frontend's BASELINE_DISPLAY_GATE convention (per JOO-32 ticket): flag a day/
// aggregate as statistically thin below this sample count. Confirmed live (2026-07-26) this is
// a common case, not an edge case — 85/365 rows were n<30 on one sampled station.
export const BASELINE_THIN_THRESHOLD = 30;

export interface StationBaselineToolDeps {
  readonly client: FahsaiClient;
}

// What /api/stations/:id/baseline returns — verified 2026-07-26 (JOO-32): exactly 365 rows (no
// Feb 29), n ranging widely (3–67 on the sampled station). An invalid/nonexistent station_id
// doesn't 404 — it returns 200 with { data: [], minYear: null, maxYear: null }.
export interface StationBaselineDayRaw {
  readonly month: number;
  readonly day: number;
  readonly medianPm25: number;
  readonly p25Pm25: number;
  readonly p75Pm25: number;
  readonly n: number;
}

export interface StationBaselineApiResponse {
  readonly data: readonly StationBaselineDayRaw[];
  readonly minYear: number | null;
  readonly maxYear: number | null;
}

// CLAUDE.md's non-negotiable constraint applies to every PM2.5 value — median/p25/p75 each get
// their own category, not just medianPm25.
export interface StationBaselineDayResult {
  readonly month: number;
  readonly day: number;
  readonly medianPm25: number;
  readonly medianAqiCategory: AqiCategory | null;
  readonly p25Pm25: number;
  readonly p25AqiCategory: AqiCategory | null;
  readonly p75Pm25: number;
  readonly p75AqiCategory: AqiCategory | null;
  readonly n: number;
  readonly thin: boolean;
}

export interface SeasonAggregate {
  readonly season: Season;
  readonly daysCovered: number;
  readonly minMedianPm25: number;
  readonly minMedianAqiCategory: AqiCategory | null;
  readonly medianOfMedianPm25: number;
  readonly medianOfMedianAqiCategory: AqiCategory | null;
  readonly maxMedianPm25: number;
  readonly maxMedianAqiCategory: AqiCategory | null;
}

export interface StationBaselineSummary {
  readonly stationId: string;
  readonly minYear: number | null;
  readonly maxYear: number | null;
  readonly season?: SeasonAggregate;
  readonly today?: StationBaselineDayResult;
  readonly day?: StationBaselineDayResult;
  readonly rows?: readonly StationBaselineDayResult[];
  readonly note?: string;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toDayResult(raw: StationBaselineDayRaw): StationBaselineDayResult {
  return {
    month: raw.month,
    day: raw.day,
    medianPm25: raw.medianPm25,
    medianAqiCategory: classifyAqiOrNull(raw.medianPm25)?.category ?? null,
    p25Pm25: raw.p25Pm25,
    p25AqiCategory: classifyAqiOrNull(raw.p25Pm25)?.category ?? null,
    p75Pm25: raw.p75Pm25,
    p75AqiCategory: classifyAqiOrNull(raw.p75Pm25)?.category ?? null,
    n: raw.n,
    thin: raw.n < BASELINE_THIN_THRESHOLD,
  };
}

function findDay(
  data: readonly StationBaselineDayRaw[],
  month: number,
  day: number,
): StationBaselineDayRaw | undefined {
  return data.find((row) => row.month === month && row.day === day);
}

function noDataNote(stationId: string): string {
  return `No baseline data for station ${stationId} — the station_id may be invalid (see get_stations).`;
}

function noDayNote(month: number, day: number): string {
  return `No baseline row for ${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.`;
}

// Shared by all three summarizer modes below — a bad/empty station_id looks identical (empty
// `data`) regardless of which mode was requested, so this is the one place that decides what
// that looks like in the response.
function emptyBaselineSummary(
  stationId: string,
  minYear: number | null,
  maxYear: number | null,
): StationBaselineSummary {
  return { stationId, minYear, maxYear, note: noDataNote(stationId) };
}

export function summarizeStationBaselineDefault(
  data: readonly StationBaselineDayRaw[],
  minYear: number | null,
  maxYear: number | null,
  stationId: string,
  today: Date = new Date(),
): StationBaselineSummary {
  if (data.length === 0) {
    return emptyBaselineSummary(stationId, minYear, maxYear);
  }

  const todayMonth = today.getUTCMonth() + 1;
  const todayDay = today.getUTCDate();
  const season = getSeason(today.toISOString());
  const seasonRows = data.filter((row) => SEASON_MONTHS[season].includes(row.month));
  const seasonMedians = seasonRows.map((row) => row.medianPm25);

  let seasonAggregate: SeasonAggregate | undefined;
  if (seasonMedians.length > 0) {
    const minMedianPm25 = Math.min(...seasonMedians);
    const medianOfMedianPm25 = median(seasonMedians);
    const maxMedianPm25 = Math.max(...seasonMedians);
    seasonAggregate = {
      season,
      daysCovered: seasonRows.length,
      minMedianPm25,
      minMedianAqiCategory: classifyAqiOrNull(minMedianPm25)?.category ?? null,
      medianOfMedianPm25,
      medianOfMedianAqiCategory: classifyAqiOrNull(medianOfMedianPm25)?.category ?? null,
      maxMedianPm25,
      maxMedianAqiCategory: classifyAqiOrNull(maxMedianPm25)?.category ?? null,
    };
  }

  const todayRow = findDay(data, todayMonth, todayDay);

  return {
    stationId,
    minYear,
    maxYear,
    season: seasonAggregate,
    today: todayRow ? toDayResult(todayRow) : undefined,
    note: todayRow ? undefined : noDayNote(todayMonth, todayDay),
  };
}

export function summarizeStationBaselineDay(
  data: readonly StationBaselineDayRaw[],
  minYear: number | null,
  maxYear: number | null,
  stationId: string,
  month: number,
  day: number,
): StationBaselineSummary {
  if (data.length === 0) {
    return emptyBaselineSummary(stationId, minYear, maxYear);
  }

  const row = findDay(data, month, day);
  return {
    stationId,
    minYear,
    maxYear,
    day: row ? toDayResult(row) : undefined,
    note: row ? undefined : noDayNote(month, day),
  };
}

export function summarizeStationBaselineFull(
  data: readonly StationBaselineDayRaw[],
  minYear: number | null,
  maxYear: number | null,
  stationId: string,
): StationBaselineSummary {
  if (data.length === 0) {
    return { ...emptyBaselineSummary(stationId, minYear, maxYear), rows: [] };
  }

  return { stationId, minYear, maxYear, rows: data.map(toDayResult) };
}

const stationBaselineDayResultOutputSchema = z.object({
  month: z.number(),
  day: z.number(),
  medianPm25: z.number(),
  medianAqiCategory: z.string().nullable(),
  p25Pm25: z.number(),
  p25AqiCategory: z.string().nullable(),
  p75Pm25: z.number(),
  p75AqiCategory: z.string().nullable(),
  n: z.number(),
  thin: z.boolean(),
});

export const stationBaselineOutputSchema = z.object({
  stationId: z.string(),
  minYear: z.number().nullable(),
  maxYear: z.number().nullable(),
  season: z
    .object({
      season: z.enum(['peak_burning', 'early_dry', 'monsoon']),
      daysCovered: z.number(),
      minMedianPm25: z.number(),
      minMedianAqiCategory: z.string().nullable(),
      medianOfMedianPm25: z.number(),
      medianOfMedianAqiCategory: z.string().nullable(),
      maxMedianPm25: z.number(),
      maxMedianAqiCategory: z.string().nullable(),
    })
    .optional(),
  today: stationBaselineDayResultOutputSchema.optional(),
  day: stationBaselineDayResultOutputSchema.optional(),
  rows: z.array(stationBaselineDayResultOutputSchema).optional(),
  note: z.string().optional(),
});

export type StationBaselineToolResult = CallToolResult;
