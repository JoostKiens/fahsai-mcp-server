import { z } from 'zod';

import { FAHSAI_DATA_BBOX, type BoundingBox } from '../logic/bbox.js';
import type { PlaceResolver, PlaceResolverError } from '../place-resolver/index.js';
import type { Result } from '../result.js';

const bboxSchema = z.object({
  west: z.number(),
  south: z.number(),
  east: z.number(),
  north: z.number(),
});

export const locationInput = z.object({
  place: z.string().min(1).optional(),
  bbox: bboxSchema.optional(),
  radius_km: z.number().positive().optional(),
});

export type LocationInput = z.infer<typeof locationInput>;

export interface ResolvedLocation {
  readonly bbox: BoundingBox;
  readonly note?: string;
}

export type LocationResolutionError =
  | PlaceResolverError
  | { readonly kind: 'outside-coverage'; readonly message: string };

// If both `place` and `bbox` are given, `bbox` wins and the note says why — never
// silently drop one input with no signal back to the caller. Neither given falls
// back to Fahsai's own default SEA bbox.
export async function resolveLocationInput(
  input: LocationInput,
  placeResolver: PlaceResolver,
): Promise<Result<ResolvedLocation, LocationResolutionError>> {
  if (input.bbox) {
    return {
      ok: true,
      value: {
        bbox: input.bbox,
        note: input.place ? '`place` was ignored because `bbox` was provided directly.' : undefined,
      },
    };
  }

  if (input.place) {
    const result = await placeResolver.resolve(input.place, { radiusKm: input.radius_km });
    if (!result.ok) return result;
    if (result.value.bbox === null) {
      return {
        ok: false,
        error: { kind: 'outside-coverage', message: `"${input.place}" is outside Fahsai's coverage area.` },
      };
    }
    return { ok: true, value: { bbox: result.value.bbox } };
  }

  return { ok: true, value: { bbox: FAHSAI_DATA_BBOX } };
}
