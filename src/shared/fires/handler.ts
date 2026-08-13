import { asArray } from '../as-array.js';
import { FAHSAI_DATA_BBOX, formatBboxParam } from '../bbox.js';
import type { FahsaiClient, FahsaiQueryParams } from '../fahsai-client/client.js';
import type { PlaceResolver } from '../place-resolver/index.js';
import { buildToolError, buildToolResponse } from '../tool-response.js';
import type {
  FireConfidence,
  FireConfidenceBreakdown,
  FireSummary,
  FireToolResult,
  SummarizedFirePoint,
} from './schema.js';

// Above this count, summarizeFires returns the top-N by FRP instead of the full list.
export const FIRE_LIST_TRUNCATION_THRESHOLD = 50;

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

const FULL_COVERAGE_BBOX_PARAM = formatBboxParam(FAHSAI_DATA_BBOX);

// Shown once a 404 has been confirmed to mean "this period is fully ingested, this area just
// has no fires" rather than "not ingested yet" — see isPeriodIngested.
export const CONFIRMED_EMPTY_FIRE_AREA_NOTE = 'There are no fires detected in this area.';

// Re-issues the same request against Fahsai's full default coverage bbox to check whether a
// date/range has actually finished ingesting, independent of whether the originally-requested
// (typically much smaller, place-derived) bbox has any fires in it. A 404 against a small bbox
// is otherwise ambiguous between "not ingested yet" and "ingested, zero fires here" — verified
// live 2026-08-13: a ~1° bbox and even a ~3°x3° bbox both 404 for a date that 200s with 297
// real fires against the full default bbox. See fahsai-api-reference.md's /api/fires entry.
export async function isPeriodIngested(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
): Promise<boolean> {
  const confirmation = await client.get(path, { ...params, bbox: FULL_COVERAGE_BBOX_PARAM });
  return confirmation.ok;
}

// Fetch -> 404-handling -> filter -> summarize -> respond. `confidence` is applied client-side
// only (see filterByConfidence) — the live API's `confidence` query param has no observable
// filtering effect (verified 2026-07-26), so it's not sent at all. Unlike get_weather/get_cams
// (shared/fetch-summarize.ts), a 404 here isn't taken at face value — see isPeriodIngested.
export async function fetchAndSummarizeFires(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
  confidence: readonly FireConfidence[] | undefined,
  notFoundNote: string,
  locationNote?: string,
): Promise<FireToolResult> {
  const fetchResult = await client.get(path, params);

  if (!fetchResult.ok) {
    if (fetchResult.error.kind !== 'not-found') {
      return buildToolError(fetchResult.error.message);
    }

    // A 404 against the full coverage bbox is already unambiguous — nothing to confirm.
    const alreadyFullCoverage = params.bbox === FULL_COVERAGE_BBOX_PARAM;
    const confirmedIngested =
      !alreadyFullCoverage && (await isPeriodIngested(client, path, params));

    return buildToolResponse(
      emptyFireSummary(),
      locationNote,
      confirmedIngested ? CONFIRMED_EMPTY_FIRE_AREA_NOTE : notFoundNote,
    );
  }

  const raw = asArray<FirePoint>((fetchResult.value as FiresApiResponse | undefined)?.data);
  return buildToolResponse(summarizeFires(filterByConfidence(raw, confidence)), locationNote);
}
