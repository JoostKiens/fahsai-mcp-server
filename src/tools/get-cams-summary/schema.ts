import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { isoDateSchema } from '../../shared/schema/date.js';

// No place/bbox/radius_km — the live API silently ignores a bbox param on this route
// (verified 2026-07-27, JOO-35): it's nationwide-only, with no area scoping possible.
export const getCamsSummaryInputSchema = z.object({
  start: isoDateSchema,
  end: isoDateSchema,
});

export type GetCamsSummaryInput = z.infer<typeof getCamsSummaryInputSchema>;

// Matches the Fahsai API's own /api/cams/summary cap. Verified live 2026-07-27 (JOO-35): a
// 139-day range succeeds, a 140-day range is rejected — even though the API's own error text
// reads "range exceeds 140 days". That message is off by one from what the API actually
// enforces; this constant matches the real enforced limit, not the message.
export const CAMS_SUMMARY_RANGE_MAX_DAYS = 139;

export interface CamsSummaryDay {
  readonly date: string;
  readonly pm25: number;
  readonly aqiCategory: string | null;
}

export interface CamsSummarySeries {
  readonly total: number;
  readonly days: readonly CamsSummaryDay[];
  readonly note?: string;
}

const camsSummaryDayOutputSchema = z.object({
  date: z.string(),
  pm25: z.number(),
  aqiCategory: z.string().nullable(),
});

export const camsSummarySeriesOutputSchema = z.object({
  total: z.number(),
  days: z.array(camsSummaryDayOutputSchema),
  note: z.string().optional(),
});

export type CamsSummaryToolResult = CallToolResult;
