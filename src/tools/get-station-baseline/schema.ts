import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { AqiCategory } from '../../shared/aqi.js';

export const getStationBaselineInputSchema = z.object({
  station_id: z.string().min(1),
  full: z.boolean().default(false),
  month: z.number().int().min(1).max(12).optional(),
  day: z.number().int().min(1).max(31).optional(),
});

export type GetStationBaselineInput = z.infer<typeof getStationBaselineInputSchema>;

// Fahsai frontend's season convention, keyed off UTC month — kept in sync manually since this
// server has no shared package with the frontend.
export type Season = 'peak_burning' | 'early_dry' | 'monsoon';

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
