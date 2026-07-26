import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient, FahsaiQueryParams } from '../fahsai-client/client.js';
import type { PlaceResolver } from '../place-resolver/index.js';
import type { Result } from '../result.js';
import { combineNotes } from './notes.js';

// Matches the Fahsai API's own /api/fires/range cap.
export const FIRES_RANGE_MAX_DAYS = 10;

// Above this count, summarizeFires returns the top-N by FRP instead of the full list.
export const FIRE_LIST_TRUNCATION_THRESHOLD = 50;

export const FIRE_CONFIDENCE_VALUES = ['low', 'nominal', 'high'] as const;
export type FireConfidence = (typeof FIRE_CONFIDENCE_VALUES)[number];

// The live API returns raw single-letter FIRMS confidence codes ('l'/'n'/'h'), not the
// full words used by this tool's friendlier input/output — verified 2026-07-26 against
// /api/fires. Anything else (unexpected code, or null) maps to null ("unknown").
const CONFIDENCE_CODE_TO_LABEL: Readonly<Record<string, FireConfidence>> = {
  l: 'low',
  n: 'nominal',
  h: 'high',
};

function toFireConfidence(code: string | null): FireConfidence | null {
  return code === null ? null : (CONFIDENCE_CODE_TO_LABEL[code] ?? null);
}

// Shared by both get_fires (date) and get_fires_range (start/end).
export const fireDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be in YYYY-MM-DD format');

export interface FiresToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// What /api/fires and /api/fires/range return, wrapped as { data: FirePoint[] } — verified
// 2026-07-26 against the live API. Earlier docs described extra fields (brightTi4,
// brightTi5, countryId, satellite) and a bare-array response; neither matches reality.
export interface FirePoint {
  readonly id: number;
  readonly detectedAt: string;
  readonly lat: number;
  readonly lng: number;
  readonly frp: number | null;
  readonly confidence: string | null;
  readonly daynight: string | null;
}

interface FiresApiResponse {
  readonly data: readonly FirePoint[];
}

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

function toSummarizedFirePoint(point: FirePoint): SummarizedFirePoint {
  return {
    id: point.id,
    detectedAt: point.detectedAt,
    lat: point.lat,
    lng: point.lng,
    frp: point.frp,
    confidence: toFireConfidence(point.confidence),
    daynight: point.daynight,
  };
}

function countByConfidence(points: readonly FirePoint[]): FireConfidenceBreakdown {
  const breakdown = { high: 0, nominal: 0, low: 0, unknown: 0 };
  for (const point of points) {
    const label = toFireConfidence(point.confidence);
    if (label) {
      breakdown[label] += 1;
    } else {
      breakdown.unknown += 1;
    }
  }
  return breakdown;
}

// The live API's `confidence` query param has no observable filtering effect (verified
// 2026-07-26: identical result sets with words, letter codes, or the param omitted
// entirely), so this tool filters client-side to actually honor the caller's request.
export function filterByConfidence(
  points: readonly FirePoint[],
  confidence?: readonly FireConfidence[],
): readonly FirePoint[] {
  if (!confidence || confidence.length === 0) return points;
  const wanted = new Set(confidence);
  return points.filter((point) => {
    const label = toFireConfidence(point.confidence);
    return label !== null && wanted.has(label);
  });
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
  return {
    total: 0,
    byConfidence: { high: 0, nominal: 0, low: 0, unknown: 0 },
    points: [],
    truncated: false,
  };
}

// Empty array means "no filter selected" — same as omitting the field entirely, never an
// empty-string query param (which the API would treat as an explicit, unmatchable filter).
// Sent to the API for forward-compatibility even though it currently has no observed effect
// (see filterByConfidence, which is what actually enforces the filter today).
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
      confidence: z.enum(FIRE_CONFIDENCE_VALUES).nullable(),
      daynight: z.string().nullable(),
    }),
  ),
  truncated: z.boolean(),
  note: z.string().optional(),
});

export type FireToolResult = CallToolResult;

// Shared MCP response shaping for both fire tools — success case.
export function buildFiresToolResponse(
  summary: FireSummary,
  ...extraNotes: ReadonlyArray<string | undefined>
): FireToolResult {
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

// Shared fetch -> 404-handling -> filter -> summarize -> respond sequence for both fire
// tools, so a change to that sequence (e.g. how notes get merged) only has to happen once.
// `confidence` is applied client-side (see filterByConfidence) in addition to being sent as
// a query param, since the server-side filter has no observed effect.
export async function fetchAndSummarizeFires(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
  confidence: readonly FireConfidence[] | undefined,
  notFoundNote: string,
  locationNote?: string,
): Promise<FireToolResult> {
  const fetchResult = await client.get<FiresApiResponse>(path, {
    ...params,
    confidence: formatConfidenceParam(confidence),
  });

  if (!fetchResult.ok) {
    if (fetchResult.error.kind === 'not-found') {
      return buildFiresToolResponse(emptyFireSummary(), locationNote, notFoundNote);
    }
    return buildFiresToolError(fetchResult.error.message);
  }

  const points = filterByConfidence(fetchResult.value.data, confidence);
  return buildFiresToolResponse(summarizeFires(points), locationNote);
}
