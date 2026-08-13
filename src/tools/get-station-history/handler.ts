import { classifyAqiOrNull } from '../../shared/aqi.js';
import { asArray } from '../../shared/as-array.js';
import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import { parseWindDirOrNull } from '../../shared/wind.js';
import type {
  GetStationHistoryInput,
  StationHistoryBaseline,
  StationHistoryDay,
  StationHistorySummary,
  StationHistoryToolResult,
  StationHistoryWeather,
} from './schema.js';

export interface StationHistoryToolDeps {
  readonly client: FahsaiClient;
}

// What /api/stations/:id/history returns, wrapped as { stationId, days: StationHistoryDayRaw[] } —
// verified 2026-07-26 (JOO-32). `pm25: 0` paired with `readingCount: 0` is a sentinel for "no
// reading ingested that day" (confirmed live: a bogus station_id returns this pair for every day),
// not a real zero reading — see toStationHistoryDay below.
export interface StationHistoryWeatherRaw {
  readonly windSpeedKmh: number | null;
  readonly windDirectionDeg: number | null;
  readonly precipitationSumMm: number | null;
  readonly relativeHumidity2m: number | null;
}

export interface StationHistoryBaselineRaw {
  readonly medianPm25: number;
  readonly p25Pm25: number;
  readonly p75Pm25: number;
  readonly n: number;
}

export interface StationHistoryDayRaw {
  readonly date: string;
  readonly pm25: number;
  readonly readingCount: number;
  readonly weather: StationHistoryWeatherRaw | null;
  readonly baseline: StationHistoryBaselineRaw | null;
}

export interface StationHistoryApiResponse {
  readonly stationId: string;
  readonly days: readonly StationHistoryDayRaw[];
}

function toStationHistoryWeather(raw: StationHistoryWeatherRaw): StationHistoryWeather {
  return {
    windSpeedKmh: raw.windSpeedKmh,
    precipitationSumMm: raw.precipitationSumMm,
    relativeHumidity2m: raw.relativeHumidity2m,
    // parseWindDirOrNull, not parseWindDir directly — a non-finite windDirectionDeg from an
    // unvalidated JSON body would otherwise throw and abort the whole get_station_history call.
    wind: raw.windDirectionDeg !== null ? parseWindDirOrNull(raw.windDirectionDeg) : null,
  };
}

function toStationHistoryBaseline(raw: StationHistoryBaselineRaw): StationHistoryBaseline {
  return {
    medianPm25: raw.medianPm25,
    medianAqiCategory: classifyAqiOrNull(raw.medianPm25)?.category ?? null,
    p25Pm25: raw.p25Pm25,
    p25AqiCategory: classifyAqiOrNull(raw.p25Pm25)?.category ?? null,
    p75Pm25: raw.p75Pm25,
    p75AqiCategory: classifyAqiOrNull(raw.p75Pm25)?.category ?? null,
    n: raw.n,
  };
}

function toStationHistoryDay(raw: StationHistoryDayRaw): StationHistoryDay {
  // readingCount:0 pairs with a sentinel pm25:0 meaning "no reading ingested" — never classify it.
  const aqi = raw.readingCount === 0 ? null : classifyAqiOrNull(raw.pm25);

  return {
    date: raw.date,
    pm25: aqi?.pm25 ?? null,
    aqiCategory: aqi?.category ?? null,
    readingCount: raw.readingCount,
    // Guarded against `undefined`, not just `null` — fahsai-client casts parsed JSON straight to
    // T with no runtime check, so a response that omits the key entirely (rather than sending an
    // explicit null) is a real possibility, and `!== null` alone would let `undefined` through to
    // toStationHistoryWeather/toStationHistoryBaseline and throw inside this function's caller (.map).
    weather:
      raw.weather !== null && raw.weather !== undefined
        ? toStationHistoryWeather(raw.weather)
        : null,
    baseline:
      raw.baseline !== null && raw.baseline !== undefined
        ? toStationHistoryBaseline(raw.baseline)
        : null,
  };
}

// No truncation — mcp-tools.md's "no raw large arrays" rule exempts station-shaped lists, and
// this endpoint's own 30-day cap already bounds the series.
export function summarizeStationHistory(
  raw: readonly StationHistoryDayRaw[],
  stationId: string,
  daysRequested: number,
): StationHistorySummary {
  return {
    stationId,
    daysRequested,
    days: raw.map(toStationHistoryDay),
  };
}

export function emptyStationHistorySummary(
  stationId: string,
  daysRequested: number,
): StationHistorySummary {
  return { stationId, daysRequested, days: [] };
}

// The live API always returns `days` at exactly the requested length, even for a bogus
// station_id (as a run of null/sentinel placeholder rows) — a genuinely empty array only
// happens for a malformed response body, but the caller/LLM still deserves a reason, matching
// get_station_readings_history's sibling convention of never returning a bare empty result.
function malformedResponseNote(stationId: string): string {
  return (
    `No day rows returned for station ${stationId} — the response may be malformed, or the ` +
    'station_id may be invalid (see get_stations).'
  );
}

export function createGetStationHistoryHandler(deps: StationHistoryToolDeps) {
  return async (input: GetStationHistoryInput): Promise<StationHistoryToolResult> => {
    const fetchResult = await deps.client.get<StationHistoryApiResponse>(
      `/api/stations/${encodeURIComponent(input.station_id)}/history`,
      { days: input.days, date: input.date },
    );

    if (!fetchResult.ok) {
      return buildToolError(fetchResult.error.message);
    }

    const days = asArray<StationHistoryDayRaw>(fetchResult.value.days);

    if (days.length === 0) {
      return buildToolResponse(
        emptyStationHistorySummary(input.station_id, input.days),
        malformedResponseNote(input.station_id),
      );
    }

    return buildToolResponse(summarizeStationHistory(days, input.station_id, input.days));
  };
}
