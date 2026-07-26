import { z } from 'zod';

import { clampToDataBbox, FAHSAI_DATA_BBOX, type BoundingBox } from '../logic/bbox.js';
import type { PlaceResolver, PlaceResolverError } from '../place-resolver/index.js';
import type { Result } from '../result.js';

export const bboxSchema = z
  .object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  })
  .refine((bbox) => bbox.west < bbox.east && bbox.south < bbox.north, {
    message: 'bbox must have west < east and south < north',
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

// Shared with geocode_place, which resolves a place directly (bypassing this function) but
// hits the same outside-coverage case and must report it the same way.
export function placeOutsideCoverageMessage(place: string): string {
  return `"${place}" is outside Fahsai's coverage area.`;
}

// Builds a "these inputs were ignored because bbox won" note — never silently drop
// an input with no signal back to the caller.
function buildIgnoredFieldsNote(ignoredFields: readonly string[]): string | undefined {
  if (ignoredFields.length === 0) return undefined;
  const verb = ignoredFields.length > 1 ? 'were' : 'was';
  return `${ignoredFields.join(' and ')} ${verb} ignored because \`bbox\` was provided directly.`;
}

// If both `place` and `bbox` are given, `bbox` wins and the note says why — never
// silently drop one input with no signal back to the caller. Neither given falls
// back to Fahsai's own default SEA bbox.
export async function resolveLocationInput(
  input: LocationInput,
  placeResolver: PlaceResolver,
): Promise<Result<ResolvedLocation, LocationResolutionError>> {
  if (input.bbox) {
    const overlap = clampToDataBbox(input.bbox, FAHSAI_DATA_BBOX);
    if (overlap === null) {
      return {
        ok: false,
        error: { kind: 'outside-coverage', message: "The given bbox does not overlap Fahsai's coverage area." },
      };
    }

    const ignoredFields: string[] = [];
    if (input.place) ignoredFields.push('`place`');
    if (input.radius_km !== undefined) ignoredFields.push('`radius_km`');

    return {
      ok: true,
      value: {
        bbox: input.bbox,
        note: buildIgnoredFieldsNote(ignoredFields),
      },
    };
  }

  if (input.place) {
    const result = await placeResolver.resolve(input.place, { radiusKm: input.radius_km });
    if (!result.ok) return result;
    if (result.value.bbox === null) {
      return {
        ok: false,
        error: { kind: 'outside-coverage', message: placeOutsideCoverageMessage(input.place) },
      };
    }
    return { ok: true, value: { bbox: result.value.bbox } };
  }

  return { ok: true, value: { bbox: FAHSAI_DATA_BBOX } };
}
