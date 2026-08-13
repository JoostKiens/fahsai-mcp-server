import { asArray } from '../as-array.js';
import { type BoundingBox, formatBboxParam } from '../bbox.js';
import type { FahsaiClient, FahsaiError } from '../fahsai-client/client.js';
import { resolveDateOrLatest } from '../latest-date.js';
import type { Result } from '../result.js';
import type { StationReadingLatestRaw, StationReadingsApiResponse } from '../station-readings.js';

// Beyond this, a "nearest" match is more misleading than useful — report no-nearby-station
// instead. Distinct from place-resolver's DEFAULT_RADIUS_KM (55km, the *search* radius used
// to build the bbox passed in here) — this is a separate, tighter acceptance threshold on
// the result, not a second search-radius concept.
const NEAREST_STATION_CUTOFF_KM = 50;

const EARTH_RADIUS_KM = 6371;

export interface NearestStation {
  readonly stationId: string;
  readonly lat: number;
  readonly lng: number;
}

export type NearestStationInput =
  | { readonly bbox: BoundingBox; readonly date?: string }
  | { readonly stationId: string };

export type NearestStationError =
  | FahsaiError
  | { readonly kind: 'no-nearby-station' | 'station-not-found'; readonly message: string };

interface StationRaw {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// bbox.ts's flat KM_PER_DEGREE conversion is explicitly too imprecise for this: a station
// just inside/outside the cutoff changes the answer from a real match to "none found".
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function bboxCenter(bbox: BoundingBox): { lat: number; lng: number } {
  return { lat: (bbox.south + bbox.north) / 2, lng: (bbox.west + bbox.east) / 2 };
}

// The API's own `date` query param may not strictly filter (this codebase has two
// precedents of Fahsai query params being silent no-ops: `confidence` on /api/fires,
// `parameter` on this very endpoint) — filter client-side to actually honor the request.
function hasReadingForDate(reading: StationReadingLatestRaw, date: string): boolean {
  return reading.measuredAt.slice(0, 10) === date;
}

function noNearbyStation(message: string): Result<NearestStation, NearestStationError> {
  return { ok: false, error: { kind: 'no-nearby-station', message } };
}

function stationNotFound(message: string): Result<NearestStation, NearestStationError> {
  return { ok: false, error: { kind: 'station-not-found', message } };
}

export async function findNearestStation(
  client: FahsaiClient,
  input: NearestStationInput,
): Promise<Result<NearestStation, NearestStationError>> {
  if ('stationId' in input) {
    return resolveByStationId(client, input.stationId);
  }
  return resolveByBbox(client, input.bbox, input.date);
}

// A directly-known station bypasses distance resolution entirely (JOO-50) — no candidate
// filtering, no cutoff, just confirm it exists and hand back its coordinates.
async function resolveByStationId(
  client: FahsaiClient,
  stationId: string,
): Promise<Result<NearestStation, NearestStationError>> {
  const fetchResult = await client.get<StationRaw>(
    `/api/stations/${encodeURIComponent(stationId)}`,
  );
  if (!fetchResult.ok) {
    if (fetchResult.error.kind === 'not-found') {
      return stationNotFound(`No station found with id "${stationId}".`);
    }
    return fetchResult;
  }

  return {
    ok: true,
    value: {
      stationId: fetchResult.value.id,
      lat: fetchResult.value.lat,
      lng: fetchResult.value.lng,
    },
  };
}

// Picks the station closest to `bbox`'s center with a reading for `date` (or the latest
// available date, if omitted), rejecting anything beyond NEAREST_STATION_CUTOFF_KM. No
// tie-break for near-equal distances — closest wins.
async function resolveByBbox(
  client: FahsaiClient,
  bbox: BoundingBox,
  date?: string,
): Promise<Result<NearestStation, NearestStationError>> {
  const dateResult = await resolveDateOrLatest(client, date);
  if (!dateResult.ok) return dateResult;
  const resolvedDate = dateResult.value;

  const fetchResult = await client.get<StationReadingsApiResponse>('/api/station-readings/latest', {
    bbox: formatBboxParam(bbox),
    date: resolvedDate,
  });

  if (!fetchResult.ok) {
    if (fetchResult.error.kind === 'not-found') {
      return noNearbyStation('No stations found within the search area.');
    }
    return fetchResult;
  }

  // Guard against a malformed success body (missing/renamed `data`) instead of letting
  // downstream indexing throw — fahsai-client casts JSON to T with no runtime check.
  const readings = asArray<StationReadingLatestRaw>(fetchResult.value?.data);
  if (readings.length === 0) {
    return noNearbyStation('No stations found within the search area.');
  }

  const candidates = readings.filter((reading) => hasReadingForDate(reading, resolvedDate));
  if (candidates.length === 0) {
    return noNearbyStation(`No station has a reading for ${resolvedDate}.`);
  }

  const center = bboxCenter(bbox);
  let nearest: { readonly station: StationReadingLatestRaw; readonly distanceKm: number } | null =
    null;
  for (const station of candidates) {
    const distanceKm = haversineKm(center.lat, center.lng, station.lat, station.lng);
    if (nearest === null || distanceKm < nearest.distanceKm) {
      nearest = { station, distanceKm };
    }
  }

  if (nearest === null || nearest.distanceKm > NEAREST_STATION_CUTOFF_KM) {
    return noNearbyStation(
      `Nearest station is more than ${NEAREST_STATION_CUTOFF_KM}km from the requested location.`,
    );
  }

  return {
    ok: true,
    value: {
      stationId: nearest.station.stationId,
      lat: nearest.station.lat,
      lng: nearest.station.lng,
    },
  };
}
