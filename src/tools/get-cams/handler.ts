import { classifyAqiOrNull } from '../../shared/aqi.js';
import { formatBboxParam } from '../../shared/bbox.js';
import type { FahsaiClient, FahsaiQueryParams } from '../../shared/fahsai-client/client.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import {
  CAMS_GRID_MAX,
  type CamsAreaSummary,
  type CamsGridPoint,
  type CamsStat,
  type CamsSummary,
  type CamsToolResult,
  type GetCamsInput,
} from './schema.js';

export interface CamsToolDeps {
  readonly client: FahsaiClient;
  readonly placeResolver: PlaceResolver;
}

// What /api/cams returns — verified 2026-07-27 (JOO-35) against the live API. Columnar, not
// an array of point objects: three parallel arrays of equal length, same index = same point.
// See fahsai-api-reference.md for the full correction note (the doc previously had this wrong).
export interface CamsGridRaw {
  readonly lats: readonly number[];
  readonly lngs: readonly number[];
  readonly pm25s: readonly number[];
}

interface CamsApiResponse {
  readonly data: CamsGridRaw;
}

function statField(value: number): CamsStat {
  const result = classifyAqiOrNull(value);
  return { pm25: result?.pm25 ?? null, aqiCategory: result?.category ?? null };
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

// Nearest-rank percentile over an already-ascending-sorted array. Degenerates to the classic
// middle element for odd-length inputs — no consumer here needs interpolated precision.
function percentile(sortedValues: readonly number[], p: number): number {
  if (sortedValues.length === 0) return NaN;
  const rank = Math.ceil((p / 100) * sortedValues.length) - 1;
  const index = Math.min(Math.max(rank, 0), sortedValues.length - 1);
  return sortedValues[index];
}

// classifyAqiOrNull(NaN) already returns null, so an empty grid degrades every stat to
// {pm25: null, aqiCategory: null} with no special-case empty check needed here.
export function computeAreaSummary(pm25s: readonly number[]): CamsAreaSummary {
  const sorted = [...pm25s].sort((a, b) => a - b);
  return {
    pointCount: pm25s.length,
    mean: statField(mean(pm25s)),
    median: statField(percentile(sorted, 50)),
    p95: statField(percentile(sorted, 95)),
  };
}

// Evenly strides across the flattened parallel arrays by index — preserves spatial coverage
// of the field. Deliberately not top-N by pm25 value (unlike summarizeFires' FRP ranking):
// fires are discrete severity-ranked events, CAMS pm25 is a continuous spatial field, so
// ranking by value would bias the sample toward hotspots and misrepresent the area.
function sampleIndices(count: number, max: number): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const stride = count / max;
  return Array.from({ length: max }, (_, i) => Math.floor(i * stride));
}

function buildGrid(
  grid: CamsGridRaw,
  n: number,
  max: number,
): { points: CamsGridPoint[]; truncated: boolean } {
  const indices = sampleIndices(n, max);
  const points = indices.map((i) => {
    const pm25 = grid.pm25s[i];
    return {
      lat: grid.lats[i],
      lng: grid.lngs[i],
      pm25,
      aqiCategory: classifyAqiOrNull(pm25)?.category ?? null,
    };
  });
  return { points, truncated: n > max };
}

export function summarizeCams(grid: CamsGridRaw, includeRawGrid: boolean): CamsSummary {
  // fahsai-client casts the parsed JSON straight to T with no runtime check — clamp to the
  // shortest of the three parallel arrays before indexing so a malformed/short array from an
  // unvalidated body can't index out of bounds.
  const n = Math.min(grid.lats.length, grid.lngs.length, grid.pm25s.length);
  const pm25s = grid.pm25s.slice(0, n);

  const base: CamsSummary = { total: n, summary: computeAreaSummary(pm25s) };
  if (!includeRawGrid) return base;

  const { points, truncated } = buildGrid(grid, n, CAMS_GRID_MAX);
  return {
    ...base,
    grid: points,
    gridTruncated: truncated,
    note: truncated
      ? `Showing ${CAMS_GRID_MAX} of ${n} grid points (evenly, spatially sampled).`
      : undefined,
  };
}

export function emptyCamsSummary(): CamsSummary {
  return { total: 0, summary: computeAreaSummary([]) };
}

// Shared fetch -> 404-handling -> summarize -> respond sequence, mirroring
// fetchAndSummarizeWeather in tools/get-weather/handler.ts.
async function fetchAndSummarizeCams(
  client: FahsaiClient,
  params: FahsaiQueryParams,
  includeRawGrid: boolean,
  notFoundNote: string,
  locationNote?: string,
): Promise<CamsToolResult> {
  const fetchResult = await client.get<CamsApiResponse>('/api/cams', params);

  if (!fetchResult.ok) {
    if (fetchResult.error.kind === 'not-found') {
      return buildToolResponse(emptyCamsSummary(), locationNote, notFoundNote);
    }
    return buildToolError(fetchResult.error.message);
  }

  // Guard against a malformed success body (missing/renamed `data`, or non-array fields)
  // instead of letting downstream indexing throw.
  const raw = fetchResult.value?.data;
  const grid: CamsGridRaw =
    raw && Array.isArray(raw.lats) && Array.isArray(raw.lngs) && Array.isArray(raw.pm25s)
      ? raw
      : { lats: [], lngs: [], pm25s: [] };

  return buildToolResponse(summarizeCams(grid, includeRawGrid), locationNote);
}

export function createGetCamsHandler(deps: CamsToolDeps) {
  return async (input: GetCamsInput): Promise<CamsToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    return fetchAndSummarizeCams(
      deps.client,
      { date: input.date, bbox: formatBboxParam(bbox) },
      input.include_raw_grid ?? false,
      `No CAMS data ingested for ${input.date} yet.`,
      locationNote,
    );
  };
}
