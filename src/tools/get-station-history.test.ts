import { describe, expect, it, vi } from 'vitest';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { NORMAL_STATION_HISTORY } from '../logic/station-history.fixtures.js';
import { createGetStationHistoryHandler, getStationHistoryInputSchema } from './get-station-history.js';

function fakeClient(get: FahsaiClient['get']): FahsaiClient {
  return { get };
}

describe('getStationHistoryInputSchema', () => {
  it('defaults days to 7 when omitted', () => {
    const parsed = getStationHistoryInputSchema.parse({ station_id: '225572' });
    expect(parsed.days).toBe(7);
    expect(parsed.date).toBeUndefined();
  });

  it('rejects days above the 30-day cap', () => {
    const result = getStationHistoryInputSchema.safeParse({ station_id: '225572', days: 31 });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed date', () => {
    const result = getStationHistoryInputSchema.safeParse({ station_id: '225572', date: '07-26-2026' });
    expect(result.success).toBe(false);
  });
});

describe('createGetStationHistoryHandler', () => {
  it('fetches and summarizes on the happy path', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: true,
      value: { stationId: '225572', days: NORMAL_STATION_HISTORY },
    });
    const handler = createGetStationHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', days: 7 });

    expect(get).toHaveBeenCalledWith('/api/stations/225572/history', { days: 7, date: undefined });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { stationId: string; days: unknown[] };
    expect(structured.stationId).toBe('225572');
    expect(structured.days).toHaveLength(2);
  });

  it('forwards the date param when provided', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { stationId: '225572', days: [] } });
    const handler = createGetStationHistoryHandler({ client: fakeClient(get) });

    await handler({ station_id: '225572', days: 3, date: '2026-06-01' });

    expect(get).toHaveBeenCalledWith('/api/stations/225572/history', { days: 3, date: '2026-06-01' });
  });

  it('treats a malformed success body (days not an array) as empty instead of throwing', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { stationId: '225572', days: null } });
    const handler = createGetStationHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', days: 7 });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { days: unknown[] };
    expect(structured.days).toEqual([]);
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetStationHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', days: 7 });

    expect(result.isError).toBe(true);
  });
});
