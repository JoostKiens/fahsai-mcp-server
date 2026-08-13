import { asArray } from '../../shared/as-array.js';
import { formatBboxParam } from '../../shared/bbox.js';
import type { FahsaiClient, FahsaiQueryParams } from '../../shared/fahsai-client/client.js';
import { fetchAndSummarize } from '../../shared/fetch-summarize.js';
import type { PlaceResolver } from '../../shared/place-resolver/index.js';
import { resolveLocationInput } from '../../shared/resolve-location.js';
import { strideSample } from '../../shared/stride-sample.js';
import { buildToolError } from '../../shared/tool-response.js';
import { parseWindDirOrNull } from '../../shared/wind.js';
import type {
  GetWeatherInput,
  WeatherAggregate,
  WeatherCell,
  WeatherPoint,
  WeatherSummary,
  WeatherToolResult,
} from './schema.js';

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
  // A single non-finite wind_speed_kmh/wind_direction_deg among `points` (a malformed
  // upstream reading — fahsai-client does no runtime validation on the JSON body) propagates
  // through the sums above as NaN. parseWindDirOrNull, not parseWindDir, so that degrades this
  // aggregate to null rather than throwing and aborting the whole (possibly default,
  // non-opt-in) response.
  const wind = parseWindDirOrNull(fromDeg);

  return {
    lat: latSum / n,
    lng: lngSum / n,
    pointCount: n,
    windSpeedKmh: wind !== null ? windSpeedKmh : null,
    wind,
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
    // parseWindDirOrNull, not parseWindDir directly — a non-finite wind_direction_deg from an
    // unvalidated JSON body would otherwise throw and abort the whole get_weather call.
    wind: parseWindDirOrNull(raw.wind_direction_deg),
    precipitationSumMm: raw.precipitation_sum,
    relativeHumidity2m: raw.relative_humidity_2m,
  };
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

// Fetch -> 404-handling -> summarize -> respond, via the shared fetchAndSummarize sequence
// (shared/fetch-summarize.ts) used by every bbox/date-scoped tool.
async function fetchAndSummarizeWeather(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
  includeRawPoints: boolean,
  notFoundNote: string,
  locationNote?: string,
): Promise<WeatherToolResult> {
  return fetchAndSummarize(client, path, params, {
    extractData: (body) =>
      asArray<WeatherGridPointRaw>((body as WeatherApiResponse | undefined)?.data),
    summarize: (points) => summarizeWeather(points, includeRawPoints),
    emptySummary: emptyWeatherSummary(),
    notFoundNote,
    locationNote,
  });
}

export function createGetWeatherHandler(deps: WeatherToolDeps) {
  return async (input: GetWeatherInput): Promise<WeatherToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    return fetchAndSummarizeWeather(
      deps.client,
      '/api/weather',
      { date: input.date, bbox: formatBboxParam(bbox) },
      input.include_raw_points ?? false,
      `No weather data ingested for ${input.date} yet.`,
      locationNote,
    );
  };
}
