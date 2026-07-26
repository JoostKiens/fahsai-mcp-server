import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient } from '../fahsai-client/client.js';
import type { PlaceResolver } from '../place-resolver/index.js';
import { classifyAqi, type AqiCategory } from './aqi.js';
import { combineNotes } from './notes.js';

export interface StationReadingsToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// What /api/station-readings/latest returns, wrapped as { data: StationReadingLatestRaw[] } —
// verified 2026-07-26 (JOO-30) against the live API, 303 stations across the full SEA bbox.
// `attribution` was never observed on any live station — it's kept here (and typed loosely,
// not assumed to be a string) because fahsai-api-reference.md's "known upstream gotchas"
// section documents it as a real, if rare, per-station OpenAQ quirk that must be passed
// through when present, not dropped.
export interface StationReadingLatestRaw {
  readonly stationId: string;
  readonly stationName: string;
  readonly lat: number;
  readonly lng: number;
  readonly country: string;
  readonly value: number;
  readonly measuredAt: string;
  readonly attribution?: unknown;
}

export interface StationReadingsApiResponse {
  readonly data: readonly StationReadingLatestRaw[];
}

export interface StationReadingSummary {
  readonly stationId: string;
  readonly stationName: string;
  readonly lat: number;
  readonly lng: number;
  readonly country: string;
  readonly measuredAt: string;
  readonly pm25: number;
  readonly aqiCategory: AqiCategory;
  readonly attribution?: unknown;
}

export interface StationReadingsSummary {
  readonly total: number;
  readonly readings: readonly StationReadingSummary[];
  readonly note?: string;
}

function toStationReadingSummary(raw: StationReadingLatestRaw): StationReadingSummary {
  const { category, pm25 } = classifyAqi(raw.value);
  const summary: StationReadingSummary = {
    stationId: raw.stationId,
    stationName: raw.stationName,
    lat: raw.lat,
    lng: raw.lng,
    country: raw.country,
    measuredAt: raw.measuredAt,
    pm25,
    aqiCategory: category,
  };
  return raw.attribution !== undefined ? { ...summary, attribution: raw.attribution } : summary;
}

// No truncation, unlike summarizeFires — station lists are bounded by the physical sensor
// network (a few hundred stations at most for the full SEA bbox), not by event volume, so
// the project's "no raw large arrays" rule (mcp-tools.md) doesn't apply here.
export function summarizeStationReadings(
  raw: readonly StationReadingLatestRaw[],
): StationReadingsSummary {
  return { total: raw.length, readings: raw.map(toStationReadingSummary) };
}

export function emptyStationReadingsSummary(): StationReadingsSummary {
  return { total: 0, readings: [] };
}

export const stationReadingsOutputSchema = z.object({
  total: z.number(),
  readings: z.array(
    z.object({
      stationId: z.string(),
      stationName: z.string(),
      lat: z.number(),
      lng: z.number(),
      country: z.string(),
      measuredAt: z.string(),
      pm25: z.number(),
      aqiCategory: z.string(),
      attribution: z.unknown().optional(),
    }),
  ),
  note: z.string().optional(),
});

export type StationReadingsToolResult = CallToolResult;

// Shared MCP response shaping — success case.
export function buildStationReadingsToolResponse(
  summary: StationReadingsSummary,
  ...extraNotes: ReadonlyArray<string | undefined>
): StationReadingsToolResult {
  const note = combineNotes(...extraNotes, summary.note);
  const structuredContent: Record<string, unknown> = note ? { ...summary, note } : { ...summary };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

// Shared MCP response shaping — error case.
export function buildStationReadingsToolError(message: string): StationReadingsToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
