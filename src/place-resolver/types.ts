import type { BoundingBox } from '../logic/bbox.js';
import type { Result } from '../result.js';

export interface ResolvedPlace {
  readonly query: string;
  readonly matchedName: string;
  readonly lat: number;
  readonly lng: number;
  readonly bbox: BoundingBox | null;
  readonly outsideCoverage: boolean;
  readonly otherMatchesCount: number;
}

export type PlaceResolverError =
  | { readonly kind: 'not-found'; readonly message: string }
  | { readonly kind: 'network'; readonly message: string }
  | { readonly kind: 'nominatim-error'; readonly message: string };

export interface ResolvePlaceOptions {
  readonly radiusKm?: number;
}

export interface PlaceResolver {
  readonly resolve: (
    query: string,
    options?: ResolvePlaceOptions,
  ) => Promise<Result<ResolvedPlace, PlaceResolverError>>;
}
