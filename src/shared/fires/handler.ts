import { asArray } from '../as-array.js';
import type { FahsaiClient, FahsaiQueryParams } from '../fahsai-client/client.js';
import { fetchAndSummarize } from '../fetch-summarize.js';
import type { PlaceResolver } from '../place-resolver/index.js';
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

// Fetch -> 404-handling -> filter -> summarize -> respond, via the shared fetchAndSummarize
// sequence (shared/fetch-summarize.ts) used by every bbox/date-scoped tool. `confidence` is
// applied client-side only (see filterByConfidence) — the live API's `confidence` query param
// has no observable filtering effect (verified 2026-07-26), so it's not sent at all.
export async function fetchAndSummarizeFires(
  client: FahsaiClient,
  path: string,
  params: FahsaiQueryParams,
  confidence: readonly FireConfidence[] | undefined,
  notFoundNote: string,
  locationNote?: string,
): Promise<FireToolResult> {
  return fetchAndSummarize(client, path, params, {
    extractData: (body) => asArray<FirePoint>((body as FiresApiResponse | undefined)?.data),
    summarize: (points) => summarizeFires(filterByConfidence(points, confidence)),
    emptySummary: emptyFireSummary(),
    notFoundNote,
    locationNote,
  });
}
