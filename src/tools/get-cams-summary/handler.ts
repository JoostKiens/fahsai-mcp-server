import { classifyAqiOrNull } from '../../shared/aqi.js';
import { validateDateRange } from '../../shared/date-range.js';
import type { FahsaiClient } from '../../shared/fahsai-client/client.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import {
  CAMS_SUMMARY_RANGE_MAX_DAYS,
  type CamsSummaryDay,
  type CamsSummarySeries,
  type CamsSummaryToolResult,
  type GetCamsSummaryInput,
} from './schema.js';

export interface CamsSummaryToolDeps {
  readonly client: FahsaiClient;
}

// What /api/cams/summary returns — verified 2026-07-27 (JOO-35) against the live API. The
// `pm25` field here is the daily p95, per the ticket author (who also maintains the fahsai
// backend) — the field name alone gives no hint of that. See fahsai-api-reference.md.
export interface CamsSummaryDayRaw {
  readonly date: string;
  readonly pm25: number;
}

interface CamsSummaryApiResponse {
  readonly data: readonly CamsSummaryDayRaw[];
}

function toSummaryDay(raw: CamsSummaryDayRaw): CamsSummaryDay {
  return {
    date: raw.date,
    pm25: raw.pm25,
    aqiCategory: classifyAqiOrNull(raw.pm25)?.category ?? null,
  };
}

export function summarizeCamsSummary(days: readonly CamsSummaryDayRaw[]): CamsSummarySeries {
  return { total: days.length, days: days.map(toSummaryDay) };
}

export function emptyCamsSummarySeries(): CamsSummarySeries {
  return { total: 0, days: [] };
}

export function createGetCamsSummaryHandler(deps: CamsSummaryToolDeps) {
  return async (input: GetCamsSummaryInput): Promise<CamsSummaryToolResult> => {
    const rangeCheck = validateDateRange(
      input.start,
      input.end,
      CAMS_SUMMARY_RANGE_MAX_DAYS,
      'get_cams_summary',
    );
    if (!rangeCheck.ok) {
      return buildToolError(rangeCheck.error);
    }

    const fetchResult = await deps.client.get<CamsSummaryApiResponse>('/api/cams/summary', {
      start: input.start,
      end: input.end,
    });

    if (!fetchResult.ok) {
      if (fetchResult.error.kind === 'not-found') {
        return buildToolResponse(
          emptyCamsSummarySeries(),
          `No CAMS summary data ingested for ${input.start}–${input.end} yet.`,
        );
      }
      return buildToolError(fetchResult.error.message);
    }

    // Guard against a malformed success body (missing/renamed `data`) instead of letting
    // downstream array methods throw.
    const data = Array.isArray(fetchResult.value?.data) ? fetchResult.value.data : [];
    return buildToolResponse(summarizeCamsSummary(data));
  };
}
