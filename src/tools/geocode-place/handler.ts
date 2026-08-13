import type { PlaceResolver, ResolvedPlace } from '../../shared/place-resolver/index.js';
import { placeOutsideCoverageMessage } from '../../shared/resolve-location.js';
import { buildToolError, buildToolResponse } from '../../shared/tool-response.js';
import type { GeocodePlaceInput, GeocodePlaceSummary, GeocodePlaceToolResult } from './schema.js';

export interface GeocodePlaceToolDeps {
  readonly placeResolver: PlaceResolver;
}

// `resolved.bbox` is only null when outsideCoverage — callers must check that first and
// treat it as an error before calling this, so it's never null here.
export function toGeocodePlaceSummary(
  resolved: ResolvedPlace & { bbox: NonNullable<ResolvedPlace['bbox']> },
): GeocodePlaceSummary {
  return {
    matchedName: resolved.matchedName,
    lat: resolved.lat,
    lng: resolved.lng,
    bbox: resolved.bbox,
    note:
      resolved.otherMatchesCount > 0
        ? `${resolved.otherMatchesCount} other match(es) were found for "${resolved.query}" — returning the top match.`
        : undefined,
  };
}

export function createGeocodePlaceHandler(deps: GeocodePlaceToolDeps) {
  return async (input: GeocodePlaceInput): Promise<GeocodePlaceToolResult> => {
    const result = await deps.placeResolver.resolve(input.place, { radiusKm: input.radius_km });
    if (!result.ok) {
      return buildToolError(result.error.message);
    }

    if (result.value.bbox === null) {
      return buildToolError(placeOutsideCoverageMessage(input.place));
    }

    return buildToolResponse(toGeocodePlaceSummary({ ...result.value, bbox: result.value.bbox }));
  };
}
