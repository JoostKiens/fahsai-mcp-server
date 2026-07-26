import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient, FahsaiQueryParams } from '../fahsai-client/client.js';
import type { PlaceResolver } from '../place-resolver/index.js';
import type { Result } from '../result.js';

// Matches the Fahsai API's own /api/fires/range cap.
export const FIRES_RANGE_MAX_DAYS = 10;

// Above this count, summarizeFires returns the top-N by FRP instead of the full list.
export const FIRE_LIST_TRUNCATION_THRESHOLD = 50;

export const FIRE_CONFIDENCE_VALUES = ['low', 'nominal', 'high'] as const;
export type FireConfidence = (typeof FIRE_CONFIDENCE_VALUES)[number];

// Shared by both get_fires (date) and get_fires_range (start/end).
export const fireDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be in YYYY-MM-DD format');

export interface FiresToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// What /api/fires and /api/fires/range return (array of).
export interface FirePoint {
  readonly id: number;
  readonly detectedAt: string;
  readonly lat: number;
  readonly lng: number;
  readonly frp: number | null;
  readonly brightTi4: number | null;
  readonly brightTi5: number | null;
  readonly countryId: string;
  readonly satellite: string | null;
  readonly confidence: string | null;
  readonly daynight: string | null;
}

// Trimmed projection of FirePoint for the response — drops the brightness-temperature
// fields, which aren't useful for "how many fires near X" style questions.
export interface SummarizedFirePoint {
  readonly id: number;
  readonly detectedAt: string;
  readonly lat: number;
  readonly lng: number;
  readonly frp: number | null;
  readonly confidence: string | null;
  readonly satellite: string | null;
  readonly daynight: string | null;
  readonly countryId: string;
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

function toSummarizedFirePoint(point: FirePoint): SummarizedFirePoint {
  return {
    id: point.id,
    detectedAt: point.detectedAt,
    lat: point.lat,
    lng: point.lng,
    frp: point.frp,
    confidence: point.confidence,
    satellite: point.satellite,
    daynight: point.daynight,
    countryId: point.countryId,
  };
}

function countByConfidence(points: readonly FirePoint[]): FireConfidenceBreakdown {
  const breakdown = { high: 0, nominal: 0, low: 0, unknown: 0 };
  for (const point of points) {
    if (point.confidence === 'high' || point.confidence === 'nominal' || point.confidence === 'low') {
      breakdown[point.confidence] += 1;
    } else {
      breakdown.unknown += 1;
    }
  }
  return breakdown;
}

// Descending by FRP; points with a null FRP sort last.
function byFrpDescending(a: FirePoint, b: FirePoint): number {
  if (a.frp === null && b.frp === null) return 0;
  if (a.frp === null) return 1;
  if (b.frp === null) return -1;
  return b.frp - a.frp;
}

export function summarizeFires(points: readonly FirePoint[]): FireSummary {
  const byConfidence = countByConfidence(points);

  if (points.length <= FIRE_LIST_TRUNCATION_THRESHOLD) {
    return {
      total: points.length,
      byConfidence,
      points: points.map(toSummarizedFirePoint),
      truncated: false,
    };
  }

  const top = [...points].sort(byFrpDescending).slice(0, FIRE_LIST_TRUNCATION_THRESHOLD);
  const omitted = points.length - top.length;

  return {
    total: points.length,
    byConfidence,
    points: top.map(toSummarizedFirePoint),
    truncated: true,
    note: `Showing the top ${FIRE_LIST_TRUNCATION_THRESHOLD} fires by fire radiative power (FRP); ${omitted} more fire(s) omitted.`,
  };
}

export function emptyFireSummary(): FireSummary {
  return { total: 0, byConfidence: { high: 0, nominal: 0, low: 0, unknown: 0 }, points: [], truncated: false };
}

// Empty array means "no filter selected" — same as omitting the field entirely, never an
// empty-string query param (which the API would treat as an explicit, unmatchable filter).
export function formatConfidenceParam(confidence?: readonly FireConfidence[]): string | undefined {
  return confidence && confidence.length > 0 ? confidence.join(',') : undefined;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseUtcDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // JS silently rolls over out-of-range days/months (e.g. "2026-02-30" -> March 2) instead
  // of rejecting them — round-trip through ISO to catch that instead of trusting getTime().
  return date.toISOString().slice(0, 10) === value ? date : null;
}

// Cross-field validation the MCP SDK's per-field inputSchema can't express — runs before
// any network call, per the 10-day cap this server enforces client-side.
export function validateFiresRange(start: string, end: string): Result<void, string> {
  const startDate = parseUtcDate(start);
  if (startDate === null) {
    return { ok: false, error: `"${start}" is not a valid calendar date.` };
  }

  const endDate = parseUtcDate(end);
  if (endDate === null) {
    return { ok: false, error: `"${end}" is not a valid calendar date.` };
  }

  if (endDate.getTime() < startDate.getTime()) {
    return { ok: false, error: '`end` must not be before `start`.' };
  }

  const days = Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
  if (days > FIRES_RANGE_MAX_DAYS) {
    return {
      ok: false,
      error: `Date range spans ${days} days; get_fires_range allows a maximum of ${FIRES_RANGE_MAX_DAYS} days. Narrow the range and try again.`,
    };
  }

  return { ok: true, value: undefined };
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
      confidence: z.string().nullable(),
      satellite: z.string().nullable(),
      daynight: z.string().nullable(),
      countryId: z.string(),
    }),
  ),
  truncated: z.boolean(),
  note: z.string().optional(),
});

export type FireToolResult = CallToolResult;

function combineNotes(...notes: ReadonlyArray<string | undefined>): string | undefined {
  const present = notes.filter((note): note is string => note !== undefined);
  return present.length > 0 ? present.join(' ') : undefined;
}

// Shared MCP response shaping for both fire tools — success case.
export function buildFiresToolResponse(summary: FireSummary, ...extraNotes: ReadonlyArray<string | undefined>): FireToolResult {
  const note = combineNotes(...extraNotes, summary.note);
  const structuredContent: Record<string, unknown> = note ? { ...summary, note } : { ...summary };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

// Shared MCP response shaping for both fire tools — error case.
export function buildFiresToolError(message: string): FireToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

// Shared fetch -> 404-handling -> summarize -> respond sequence for both fire tools, so a
// change to that sequence (e.g. how notes get merged) only has to happen once.
export async function fetchAndSummarizeFires(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
  notFoundNote: string,
  locationNote?: string,
): Promise<FireToolResult> {
  const fetchResult = await client.get<FirePoint[]>(path, params);

  if (!fetchResult.ok) {
    if (fetchResult.error.kind === 'not-found') {
      return buildFiresToolResponse(emptyFireSummary(), locationNote, notFoundNote);
    }
    return buildFiresToolError(fetchResult.error.message);
  }

  return buildFiresToolResponse(summarizeFires(fetchResult.value), locationNote);
}
