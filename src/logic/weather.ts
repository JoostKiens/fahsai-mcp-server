import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { FahsaiClient, FahsaiQueryParams } from '../fahsai-client/client.js';
import type { PlaceResolver } from '../place-resolver/index.js';
import { buildToolError, buildToolResponse } from './tool-response.js';
import { parseWindDir, type WindDir } from './wind.js';

// Bin size for the default (non-opt-in) response — lands the full SEA bbox (89,1,114,30,
// ~25x29 degrees) at roughly 90 cells, coarse enough to read as a summary while still
// showing regional variation.
export const WEATHER_CELL_SIZE_DEG = 3;

// Above this count, raw points (when explicitly requested) are evenly stride-sampled down
// to the cap rather than returned in full — per mcp-tools.md's "full raw data only behind
// an explicit opt-in param, with a hard cap."
export const WEATHER_RAW_POINTS_MAX = 1000;

export interface WeatherToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// What /api/weather returns, wrapped as { data: WeatherGridPointRaw[] } — verified
// 2026-07-27 (JOO-34) against the live API, 4,599 points for the default SEA bbox. See
// fahsai-api-reference.md for the full correction note (the doc previously had this wrong).
export interface WeatherGridPointRaw {
  readonly lat: number;
  readonly lng: number;
  readonly wind_speed_kmh: number;
  readonly wind_direction_deg: number;
  readonly relative_humidity_2m: number;
  readonly precipitation_sum: number;
}

interface WeatherApiResponse {
  readonly data: readonly WeatherGridPointRaw[];
}

export interface WeatherAggregate {
  readonly lat: number;
  readonly lng: number;
  readonly pointCount: number;
  readonly windSpeedKmh: number | null;
  readonly wind: WindDir | null;
  readonly precipitationSumMm: number | null;
  readonly relativeHumidity2m: number | null;
}

export type WeatherCell = WeatherAggregate;

export interface WeatherPoint {
  readonly lat: number;
  readonly lng: number;
  readonly windSpeedKmh: number;
  readonly wind: WindDir;
  readonly precipitationSumMm: number;
  readonly relativeHumidity2m: number;
}

const EMPTY_AGGREGATE: WeatherAggregate = {
  lat: 0,
  lng: 0,
  pointCount: 0,
  windSpeedKmh: null,
  wind: null,
  precipitationSumMm: null,
  relativeHumidity2m: null,
};

// The one reducer used for both per-cell and bbox-wide aggregation. Wind can't be
// arithmetic-averaged (raw degrees break at the 0/360 wraparound) — each reading is
// decomposed into eastward (u) / northward (v) components of the "blowing toward" vector
// (the negation of the FROM direction this API reports), summed, then converted back to a
// single speed + FROM-direction. This is standard circular/vector wind averaging.
export function aggregateWeatherPoints(points: readonly WeatherGridPointRaw[]): WeatherAggregate {
  if (points.length === 0) return EMPTY_AGGREGATE;

  let latSum = 0;
  let lngSum = 0;
  let uSum = 0;
  let vSum = 0;
  let precipSum = 0;
  let humiditySum = 0;

  for (const point of points) {
    latSum += point.lat;
    lngSum += point.lng;
    const fromRad = (point.wind_direction_deg * Math.PI) / 180;
    uSum += -point.wind_speed_kmh * Math.sin(fromRad);
    vSum += -point.wind_speed_kmh * Math.cos(fromRad);
    precipSum += point.precipitation_sum;
    humiditySum += point.relative_humidity_2m;
  }

  const n = points.length;
  const uMean = uSum / n;
  const vMean = vSum / n;
  const windSpeedKmh = Math.sqrt(uMean * uMean + vMean * vMean);
  const fromDeg = ((Math.atan2(-uMean, -vMean) * 180) / Math.PI + 360) % 360;

  return {
    lat: latSum / n,
    lng: lngSum / n,
    pointCount: n,
    windSpeedKmh,
    wind: parseWindDir(fromDeg),
    precipitationSumMm: precipSum / n,
    relativeHumidity2m: humiditySum / n,
  };
}

function binIntoCells(points: readonly WeatherGridPointRaw[], cellSizeDeg: number): WeatherCell[] {
  const groups = new Map<string, WeatherGridPointRaw[]>();
  for (const point of points) {
    const key = `${Math.floor(point.lat / cellSizeDeg)}:${Math.floor(point.lng / cellSizeDeg)}`;
    const group = groups.get(key);
    if (group) {
      group.push(point);
    } else {
      groups.set(key, [point]);
    }
  }
  return Array.from(groups.values()).map(aggregateWeatherPoints);
}

function toWeatherPoint(raw: WeatherGridPointRaw): WeatherPoint {
  return {
    lat: raw.lat,
    lng: raw.lng,
    windSpeedKmh: raw.wind_speed_kmh,
    wind: parseWindDir(raw.wind_direction_deg),
    precipitationSumMm: raw.precipitation_sum,
    relativeHumidity2m: raw.relative_humidity_2m,
  };
}

// Evenly strides through `points` down to `max` entries rather than truncating to a prefix —
// a straight prefix would only ever show one corner of the bbox given the API's row-scan
// point ordering.
function strideSample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const stride = points.length / max;
  return Array.from({ length: max }, (_, i) => points[Math.floor(i * stride)]);
}

export interface WeatherSummary {
  readonly total: number;
  readonly cells: readonly WeatherCell[];
  readonly summary: WeatherAggregate;
  readonly rawPoints?: readonly WeatherPoint[];
  readonly rawPointsTruncated?: boolean;
  readonly note?: string;
}

export function summarizeWeather(
  points: readonly WeatherGridPointRaw[],
  includeRawPoints: boolean,
): WeatherSummary {
  const base = {
    total: points.length,
    cells: binIntoCells(points, WEATHER_CELL_SIZE_DEG),
    summary: aggregateWeatherPoints(points),
  };

  if (!includeRawPoints) return base;

  const truncated = points.length > WEATHER_RAW_POINTS_MAX;
  const sampled = truncated ? strideSample(points, WEATHER_RAW_POINTS_MAX) : points;

  return {
    ...base,
    rawPoints: sampled.map(toWeatherPoint),
    rawPointsTruncated: truncated,
    note: truncated
      ? `Showing ${WEATHER_RAW_POINTS_MAX} of ${points.length} raw grid points (evenly sampled).`
      : undefined,
  };
}

export function emptyWeatherSummary(): WeatherSummary {
  return { total: 0, cells: [], summary: EMPTY_AGGREGATE };
}

const windOutputSchema = z.object({
  fromLabel: z.string(),
  toLabel: z.string(),
  fromQuadrant: z.string(),
  toQuadrant: z.string(),
});

const weatherAggregateOutputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  pointCount: z.number(),
  windSpeedKmh: z.number().nullable(),
  wind: windOutputSchema.nullable(),
  precipitationSumMm: z.number().nullable(),
  relativeHumidity2m: z.number().nullable(),
});

const weatherPointOutputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  windSpeedKmh: z.number(),
  wind: windOutputSchema,
  precipitationSumMm: z.number(),
  relativeHumidity2m: z.number(),
});

export const weatherOutputSchema = z.object({
  total: z.number(),
  cells: z.array(weatherAggregateOutputSchema),
  summary: weatherAggregateOutputSchema,
  rawPoints: z.array(weatherPointOutputSchema).optional(),
  rawPointsTruncated: z.boolean().optional(),
  note: z.string().optional(),
});

export type WeatherToolResult = CallToolResult;

// Shared fetch -> 404-handling -> summarize -> respond sequence, mirroring
// fetchAndSummarizeFires in fires.ts.
export async function fetchAndSummarizeWeather(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
  includeRawPoints: boolean,
  notFoundNote: string,
  locationNote?: string,
): Promise<WeatherToolResult> {
  const fetchResult = await client.get<WeatherApiResponse>(path, params);

  if (!fetchResult.ok) {
    if (fetchResult.error.kind === 'not-found') {
      return buildToolResponse(emptyWeatherSummary(), locationNote, notFoundNote);
    }
    return buildToolError(fetchResult.error.message);
  }

  return buildToolResponse(summarizeWeather(fetchResult.value.data, includeRawPoints), locationNote);
}
