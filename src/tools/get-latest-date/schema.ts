import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const getLatestDateInputSchema = z.object({});

export type GetLatestDateInput = z.infer<typeof getLatestDateInputSchema>;

export type LatestDateToolResult = CallToolResult;

// The API returns a bare { date }, no per-source breakdown — this is a static fact about
// what the route is gated on, not something that varies per response (verified 2026-07-29,
// JOO-36; see fahsai-api-reference.md).
export const LATEST_DATE_GATING_NOTE =
  'Most recent date with complete data across fires, CAMS, and ground station readings.';

export interface LatestDateSummary {
  readonly date: string;
  readonly note: string;
}

export const latestDateOutputSchema = z.object({
  date: z.string(),
  note: z.string(),
});
