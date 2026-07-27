import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Matches the Fahsai API's own /api/fires/range cap.
export const FIRES_RANGE_MAX_DAYS = 10;

export const FIRE_CONFIDENCE_VALUES = ['low', 'nominal', 'high'] as const;
export type FireConfidence = (typeof FIRE_CONFIDENCE_VALUES)[number];

// Trimmed projection of FirePoint for the response — confidence is normalized from the raw
// FIRMS code to a friendly label.
export interface SummarizedFirePoint {
  readonly id: number;
  readonly detectedAt: string;
  readonly lat: number;
  readonly lng: number;
  readonly frp: number | null;
  readonly confidence: FireConfidence | null;
  readonly daynight: string | null;
}

export interface FireConfidenceBreakdown {
  readonly high: number;
  readonly nominal: number;
  readonly low: number;
  readonly unknown: number;
}

export interface FireSummary {
  readonly total: number;
  readonly byConfidence: FireConfidenceBreakdown;
  readonly points: readonly SummarizedFirePoint[];
  readonly truncated: boolean;
  readonly note?: string;
}

export const fireSummaryOutputSchema = z.object({
  total: z.number(),
  byConfidence: z.object({
    high: z.number(),
    nominal: z.number(),
    low: z.number(),
    unknown: z.number(),
  }),
  points: z.array(
    z.object({
      id: z.number(),
      detectedAt: z.string(),
      lat: z.number(),
      lng: z.number(),
      frp: z.number().nullable(),
      confidence: z.enum(FIRE_CONFIDENCE_VALUES).nullable(),
      daynight: z.string().nullable(),
    }),
  ),
  truncated: z.boolean(),
  note: z.string().optional(),
});

export type FireToolResult = CallToolResult;
