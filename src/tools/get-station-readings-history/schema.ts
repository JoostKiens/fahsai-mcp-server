import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { AqiCategory } from '../../shared/aqi.js';

// Matches the live API's own cap on /api/station-readings/history — verified 2026-07-26
// (JOO-31): hours>168 is a 400 ("hours cannot exceed 168 (7 days)").
export const STATION_READINGS_HISTORY_MAX_HOURS = 168;

export const getStationReadingsHistoryInputSchema = z.object({
  station_id: z.string().min(1),
  // Not a literal `'pm25'`: the live API confirmed-ignores this param regardless of value
  // (see handler.ts), so rejecting anything other than 'pm25' would just be confusing
  // friction with no behavioral payoff — accept and ignore, like the API does.
  parameter: z.string().default('pm25'),
  hours: z.number().int().positive().max(STATION_READINGS_HISTORY_MAX_HOURS).default(24),
});

export type GetStationReadingsHistoryInput = z.infer<typeof getStationReadingsHistoryInputSchema>;

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
