import { describe, expect, it, vi } from 'vitest';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { SMALL_STATION_READINGS_HISTORY } from '../logic/station-readings-history.fixtures.js';
import { createGetStationReadingsHistoryHandler } from './get-station-readings-history.js';

function fakeClient(get: FahsaiClient['get']): FahsaiClient {
  return { get };
}

describe('createGetStationReadingsHistoryHandler', () => {
  it('fetches and summarizes on the happy path, applying the hours default', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { data: SMALL_STATION_READINGS_HISTORY } });
    const handler = createGetStationReadingsHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '6289999', parameter: 'pm25', hours: 168 });

    expect(get).toHaveBeenCalledWith('/api/station-readings/history', {
      station_id: '6289999',
      hours: 168,
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; stationId: string };
    expect(structured.total).toBe(6);
    expect(structured.stationId).toBe('6289999');
  });

  it('does not send a `parameter` query param (it is a no-op on the live API)', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetStationReadingsHistoryHandler({ client: fakeClient(get) });

    await handler({ station_id: '6289999', parameter: 'pm25', hours: 24 });

    const [, params] = get.mock.calls[0] as [string, Record<string, unknown>];
    expect(params).not.toHaveProperty('parameter');
  });

  it('treats an empty data array as "no data" — covers both an invalid station_id and a genuinely empty window', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetStationReadingsHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: 'nonexistent-id-999', parameter: 'pm25', hours: 24 });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe(
      'No PM2.5 readings found for station nonexistent-id-999 in the last 24h — the station_id ' +
        'may be invalid (see get_stations), or data may not be ingested for this window yet.',
    );
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetStationReadingsHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '6289999', parameter: 'pm25', hours: 24 });

    expect(result.isError).toBe(true);
  });
});
