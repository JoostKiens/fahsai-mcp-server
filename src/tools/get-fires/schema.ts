import { z } from 'zod';

import { FIRE_CONFIDENCE_VALUES } from '../../shared/fires/schema.js';
import { isoDateSchema } from '../../shared/schema/date.js';
import { locationInput } from '../../shared/schema/location.js';

export const getFiresInputSchema = z.object({
  ...locationInput.shape,
  date: isoDateSchema,
  confidence: z.array(z.enum(FIRE_CONFIDENCE_VALUES)).optional(),
});

export type GetFiresInput = z.infer<typeof getFiresInputSchema>;
