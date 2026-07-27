import { z } from 'zod';

import { FIRE_CONFIDENCE_VALUES } from '../../shared/fires/schema.js';
import { isoDateSchema } from '../../shared/schema/date.js';
import { locationInput } from '../../shared/schema/location.js';

export const getFiresRangeInputSchema = z.object({
  ...locationInput.shape,
  start: isoDateSchema,
  end: isoDateSchema,
  confidence: z.array(z.enum(FIRE_CONFIDENCE_VALUES)).optional(),
});

export type GetFiresRangeInput = z.infer<typeof getFiresRangeInputSchema>;
