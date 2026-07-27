import { z } from 'zod';

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
