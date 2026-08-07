import { describe, expect, it } from 'vitest';

import type { BoundingBox } from '../../shared/bbox.js';
import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import { createPlaceResolver } from '../../shared/place-resolver/index.js';
import { createGetReadingExplanationHandler } from './handler.js';
import { readingExplanationOutputSchema } from './schema.js';

// Same dense-station area used by get-station-readings's and findNearestStation's own live tests.
const CENTRAL_THAILAND_BBOX: BoundingBox = { west: 99, south: 13, east: 101, north: 15 };

describe('createGetReadingExplanationHandler (live)', () => {
  it('returns a ScientificContext response that validates against the output schema without stripping fields', async () => {
    const client = createFahsaiClient();
    const placeResolver = createPlaceResolver();
    const handler = createGetReadingExplanationHandler({ client, placeResolver });

    const result = await handler({ bbox: CENTRAL_THAILAND_BBOX });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;

    // A "no reading for today" not-found response is valid too (thin ingestion lag near the
    // current date) — only assert the full schema/no-stripping property on an actual reading.
    if (structured.station === undefined) {
      expect(typeof structured.note).toBe('string');
      return;
    }

    const parsed = readingExplanationOutputSchema.safeParse(structured);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(Object.keys(parsed.data).sort()).toEqual(Object.keys(structured).sort());
  });
});
