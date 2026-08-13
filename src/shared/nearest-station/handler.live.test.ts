import { describe, expect, it } from 'vitest';

import type { BoundingBox } from '../bbox.js';
import { createFahsaiClient } from '../fahsai-client/client.js';
import { findNearestStation } from './handler.js';

// Central Thailand — same dense-station area used by get-station-readings's own live test.
const CENTRAL_THAILAND_BBOX: BoundingBox = { west: 99, south: 13, east: 101, north: 15 };

describe('findNearestStation (live)', () => {
  it('finds a nearby station when no date is given (exercises the /api/latest-date fallback)', async () => {
    const client = createFahsaiClient();

    const result = await findNearestStation(client, { bbox: CENTRAL_THAILAND_BBOX });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected a successful result, got: ${JSON.stringify(result.error)}`);
    expect(typeof result.value.stationId).toBe('string');
    expect(typeof result.value.lat).toBe('number');
    expect(typeof result.value.lng).toBe('number');
  });

  it('resolves a known stationId directly via GET /api/stations/:id', async () => {
    const client = createFahsaiClient();

    const result = await findNearestStation(client, { stationId: '10004' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`Expected a successful result, got: ${JSON.stringify(result.error)}`);
    expect(result.value.stationId).toBe('10004');
    expect(typeof result.value.lat).toBe('number');
    expect(typeof result.value.lng).toBe('number');
  });

  it('returns station-not-found for an unknown stationId', async () => {
    const client = createFahsaiClient();

    const result = await findNearestStation(client, { stationId: 'definitely-not-a-real-id' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a failure result');
    expect(result.error.kind).toBe('station-not-found');
  });
});
