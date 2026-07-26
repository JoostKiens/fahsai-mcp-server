import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient } from '../fahsai-client/client.js';
import type { PlaceResolver } from '../place-resolver/index.js';
import { FIRE_LIST_TRUNCATION_THRESHOLD } from './fires.constants.js';

export interface FiresToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

export const FIRE_CONFIDENCE_VALUES = ['low', 'nominal', 'high'] as const;
export type FireConfidence = (typeof FIRE_CONFIDENCE_VALUES)[number];

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
export function buildFiresToolResponse(summary: FireSummary, extraNote?: string): FireToolResult {
  const note = combineNotes(extraNote, summary.note);
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
