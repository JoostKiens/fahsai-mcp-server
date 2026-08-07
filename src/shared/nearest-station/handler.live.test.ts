import { describe, expect, it } from 'vitest';

import type { BoundingBox } from '../bbox.js';
import { createFahsaiClient } from '../fahsai-client/client.js';
import { findNearestStation } from './handler.js';

// Central Thailand — same dense-station area used by get-station-readings's own live test.
const CENTRAL_THAILAND_BBOX: BoundingBox = { west: 99, south: 13, east: 101, north: 15 };

describe('findNearestStation (live)', () => {
  it('finds a nearby station when no date is given (exercises the /api/latest-date fallback)', async () => {
    const client = createFahsaiClient();

    const result = await findNearestStation(client, CENTRAL_THAILAND_BBOX);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected a successful result, got: ${JSON.stringify(result.error)}`);
    expect(typeof result.value.stationId).toBe('string');
    expect(typeof result.value.lat).toBe('number');
    expect(typeof result.value.lng).toBe('number');
  });
});
