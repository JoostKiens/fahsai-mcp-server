import { FAHSAI_DATA_BBOX, clampToDataBbox, radiusKmToBbox } from '../bbox.js';
import type { Result } from '../result.js';
import { Cache } from './cache.js';
import { DEFAULT_CACHE_TTL_SECONDS, DEFAULT_RADIUS_KM } from './constants.js';
import { createNominatimClient, type NominatimClient } from './nominatim-client.js';
import type { PlaceResolver, PlaceResolverError, ResolvePlaceOptions, ResolvedPlace } from './types.js';

interface CachedPoint {
  readonly matchedName: string;
  readonly lat: number;
  readonly lng: number;
  readonly otherMatchesCount: number;
}

export interface CreatePlaceResolverOptions {
  readonly cacheTtlSeconds?: number;
  readonly nominatimClient?: NominatimClient;
}

export function createPlaceResolver(options: CreatePlaceResolverOptions = {}): PlaceResolver {
  const cacheTtlSeconds = options.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
  const nominatimClient = options.nominatimClient ?? createNominatimClient();
  const cache = new Cache<CachedPoint>(cacheTtlSeconds * 1000);

  async function resolve(
    query: string,
    resolveOptions: ResolvePlaceOptions = {},
  ): Promise<Result<ResolvedPlace, PlaceResolverError>> {
    const trimmedQuery = query.trim();
    const cacheKey = trimmedQuery.toLowerCase();
    const radiusKm = resolveOptions.radiusKm ?? DEFAULT_RADIUS_KM;

    let point = cache.get(cacheKey);
    if (!point) {
      const searchResult = await nominatimClient.search(trimmedQuery);
      if (!searchResult.ok) {
        return { ok: false, error: searchResult.error };
      }
      if (searchResult.value.length === 0) {
        return { ok: false, error: { kind: 'not-found', message: `No location found for "${trimmedQuery}".` } };
      }

      const [top, ...rest] = searchResult.value;
      point = {
        matchedName: top.display_name,
        lat: Number(top.lat),
        lng: Number(top.lon),
        otherMatchesCount: rest.length,
      };
      cache.set(cacheKey, point);
    }

    const rawBbox = radiusKmToBbox(point.lat, point.lng, radiusKm);
    const bbox = clampToDataBbox(rawBbox, FAHSAI_DATA_BBOX);

    return {
      ok: true,
      value: {
        query: trimmedQuery,
        matchedName: point.matchedName,
        lat: point.lat,
        lng: point.lng,
        bbox,
        outsideCoverage: bbox === null,
        otherMatchesCount: point.otherMatchesCount,
      },
    };
  }

  return { resolve };
}
