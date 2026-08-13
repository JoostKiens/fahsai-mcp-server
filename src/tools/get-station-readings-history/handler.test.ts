import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import {
  createGetStationReadingsHistoryHandler,
  emptyStationReadingsHistorySummary,
  summarizeStationReadingsHistory,
} from './handler.js';
import {
  EMPTY_STATION_READINGS_HISTORY,
  SMALL_STATION_READINGS_HISTORY,
  SPARSE_STATION_READINGS_HISTORY,
  STATION_READINGS_HISTORY_WITH_INVALID_VALUE,
} from './handler.fixtures.js';
import { getStationReadingsHistoryInputSchema } from './schema.js';

describe('summarizeStationReadingsHistory', () => {
  it('returns total 0 and an empty readings array for no data', () => {
    const summary = summarizeStationReadingsHistory(EMPTY_STATION_READINGS_HISTORY, '6289999', 168);
    expect(summary).toEqual({ stationId: '6289999', hoursRequested: 168, total: 0, readings: [] });
  });

  it('matches emptyStationReadingsHistorySummary for no data', () => {
    expect(summarizeStationReadingsHistory(EMPTY_STATION_READINGS_HISTORY, '6289999', 24)).toEqual(
      emptyStationReadingsHistorySummary('6289999', 24),
    );
  });

  it('maps every point, attaching pm25 and aqiCategory, preserving order', () => {
    const summary = summarizeStationReadingsHistory(SMALL_STATION_READINGS_HISTORY, '6289999', 168);

    expect(summary.stationId).toBe('6289999');
    expect(summary.hoursRequested).toBe(168);
    expect(summary.total).toBe(6);
    expect(summary.readings.map((r) => r.aqiCategory)).toEqual([
      'Moderate',
      'Moderate',
      'Moderate',
      'Moderate',
      'Good',
      'Very Unhealthy',
    ]);
    expect(summary.readings[0]).toEqual({
      measuredAt: '2026-07-20T00:00:00+00:00',
      pm25: 33.7,
      aqiCategory: 'Moderate',
    });
    expect(summary.note).toBeUndefined();
  });

  it('summarizes a sparse/gappy series with no special-casing', () => {
    const summary = summarizeStationReadingsHistory(SPARSE_STATION_READINGS_HISTORY, '6289999', 168);

    expect(summary.total).toBe(2);
    expect(summary.readings).toHaveLength(2);
    expect(summary.note).toBeUndefined();
  });

  it('omits points with an invalid pm25 value instead of throwing, with a note', () => {
    const summary = summarizeStationReadingsHistory(
      STATION_READINGS_HISTORY_WITH_INVALID_VALUE,
      '6289999',
      168,
    );

    expect(summary.total).toBe(2);
    expect(summary.readings.map((r) => r.pm25)).toEqual([5.33, 20]);
    expect(summary.note).toBe('2 reading(s) omitted for an invalid PM2.5 value.');
  });
});

describe('getStationReadingsHistoryInputSchema', () => {
  it('defaults hours to 24 when omitted', () => {
    const parsed = getStationReadingsHistoryInputSchema.parse({ station_id: '6289999' });

    expect(parsed.hours).toBe(24);
  });

  it('rejects hours above the 168-hour cap', () => {
    const result = getStationReadingsHistoryInputSchema.safeParse({
      station_id: '6289999',
      hours: 200,
    });

    expect(result.success).toBe(false);
  });
});

describe('createGetStationReadingsHistoryHandler', () => {
  it('fetches and summarizes on the happy path', async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ ok: true, value: { data: SMALL_STATION_READINGS_HISTORY } });
    const handler = createGetStationReadingsHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '6289999', hours: 168 });

    expect(get).toHaveBeenCalledWith('/api/station-readings/history', {
      station_id: '6289999',
      hours: 168,
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; stationId: string };
    expect(structured.total).toBe(6);
    expect(structured.stationId).toBe('6289999');
  });

  it('treats a malformed success body (data not an array) as "no data" instead of throwing', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: null } });
    const handler = createGetStationReadingsHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '6289999', hours: 24 });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(0);
  });

  it('treats an empty data array as "no data" — covers both an invalid station_id and a genuinely empty window', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });
    const handler = createGetStationReadingsHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: 'nonexistent-id-999', hours: 24 });

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

    const result = await handler({ station_id: '6289999', hours: 24 });

    expect(result.isError).toBe(true);
  });
});
