import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import {
  createGetStationHistoryHandler,
  emptyStationHistorySummary,
  summarizeStationHistory,
} from './handler.js';
import {
  BOGUS_STATION_ID_HISTORY,
  EMPTY_STATION_HISTORY,
  NORMAL_STATION_HISTORY,
  STATION_HISTORY_WITH_INVALID_WIND_DIRECTION,
  STATION_HISTORY_WITH_NO_DATA_DAY,
  STATION_HISTORY_WITH_NULL_FIELDS,
  STATION_HISTORY_WITH_UNDEFINED_FIELDS,
} from './handler.fixtures.js';
import { getStationHistoryInputSchema } from './schema.js';

describe('summarizeStationHistory', () => {
  it('returns an empty days array for no data', () => {
    const summary = summarizeStationHistory(EMPTY_STATION_HISTORY, '225572', 7);
    expect(summary).toEqual({ stationId: '225572', daysRequested: 7, days: [] });
  });

  it('matches emptyStationHistorySummary for no data', () => {
    expect(summarizeStationHistory(EMPTY_STATION_HISTORY, '225572', 7)).toEqual(
      emptyStationHistorySummary('225572', 7),
    );
  });

  it('maps a normal day, attaching pm25/aqiCategory and formatting wind, never surfacing raw windDirectionDeg', () => {
    const summary = summarizeStationHistory(NORMAL_STATION_HISTORY, '225572', 7);

    expect(summary.days).toHaveLength(2);
    const [first] = summary.days;
    expect(first).toEqual({
      date: '2026-06-16',
      pm25: 16.5,
      aqiCategory: 'Moderate',
      readingCount: 1,
      weather: {
        windSpeedKmh: 5.5,
        precipitationSumMm: 24.6,
        relativeHumidity2m: 44,
        wind: { fromLabel: 'NW', toLabel: 'SE', fromQuadrant: 'NW', toQuadrant: 'SE' },
      },
      baseline: {
        medianPm25: 16,
        medianAqiCategory: 'Moderate',
        p25Pm25: 13.9,
        p25AqiCategory: 'Moderate',
        p75Pm25: 20.3,
        p75AqiCategory: 'Moderate',
        n: 63,
      },
    });
    expect(JSON.stringify(first)).not.toContain('windDirectionDeg');
  });

  it('never returns a PM2.5 value (top-level or baseline) without an aqiCategory', () => {
    const summary = summarizeStationHistory(NORMAL_STATION_HISTORY, '225572', 7);

    for (const day of summary.days) {
      if (day.pm25 !== null) expect(day.aqiCategory).not.toBeNull();
      if (day.baseline !== null) {
        expect(day.baseline.medianAqiCategory).not.toBeNull();
        expect(day.baseline.p25AqiCategory).not.toBeNull();
        expect(day.baseline.p75AqiCategory).not.toBeNull();
      }
    }
  });

  it('treats missing (undefined) weather/baseline keys the same as explicit null, without throwing', () => {
    const summary = summarizeStationHistory(STATION_HISTORY_WITH_UNDEFINED_FIELDS, '225572', 7);

    expect(summary.days[0].weather).toBeNull();
    expect(summary.days[0].baseline).toBeNull();
  });

  it('falls back to a null wind instead of throwing for a non-finite windDirectionDeg', () => {
    const summary = summarizeStationHistory(STATION_HISTORY_WITH_INVALID_WIND_DIRECTION, '225572', 7);

    expect(summary.days[0].weather?.wind).toBeNull();
    expect(summary.days[0].weather?.windSpeedKmh).toBe(5.5);
  });

  it('nulls pm25/aqiCategory for a readingCount:0 sentinel day instead of classifying pm25:0', () => {
    const summary = summarizeStationHistory(STATION_HISTORY_WITH_NO_DATA_DAY, '225572', 7);

    expect(summary.days[0].readingCount).toBe(0);
    expect(summary.days[0].pm25).toBeNull();
    expect(summary.days[0].aqiCategory).toBeNull();
  });

  it('preserves weather:null and baseline:null explicitly, not omitted', () => {
    const summary = summarizeStationHistory(STATION_HISTORY_WITH_NULL_FIELDS, '225572', 7);

    expect(summary.days[0]).toHaveProperty('weather', null);
    expect(summary.days[0]).toHaveProperty('baseline', null);
  });

  it('handles a bogus station_id (200 with a full window of null/sentinel days) without throwing', () => {
    const summary = summarizeStationHistory(BOGUS_STATION_ID_HISTORY, '999999999', 7);

    expect(summary.days).toHaveLength(7);
    for (const day of summary.days) {
      expect(day.pm25).toBeNull();
      expect(day.aqiCategory).toBeNull();
      expect(day.weather).toBeNull();
      expect(day.baseline).toBeNull();
    }
  });
});

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

  it('treats a malformed success body (days not an array) as empty instead of throwing, with a note', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { stationId: '225572', days: null } });
    const handler = createGetStationHistoryHandler({ client: fakeClient(get) });

    const result = await handler({ station_id: '225572', days: 7 });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { days: unknown[]; note?: string };
    expect(structured.days).toEqual([]);
    expect(structured.note).toBe(
      'No day rows returned for station 225572 — the response may be malformed, or the ' +
        'station_id may be invalid (see get_stations).',
    );
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
