import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import { EMPTY_CAMS_SUMMARY, TEN_DAY_CAMS_SUMMARY } from './handler.fixtures.js';
import {
  createGetCamsSummaryHandler,
  emptyCamsSummarySeries,
  summarizeCamsSummary,
} from './handler.js';
import { CAMS_SUMMARY_RANGE_MAX_DAYS } from './schema.js';

describe('summarizeCamsSummary', () => {
  it("classifies every day's PM2.5 (the daily p95) with an AQI category, against a real 10-day series", () => {
    const summary = summarizeCamsSummary(TEN_DAY_CAMS_SUMMARY);

    expect(summary.total).toBe(10);
    expect(summary.days).toHaveLength(10);
    expect(summary.days.every((day) => day.aqiCategory === 'Moderate')).toBe(true);
    expect(summary.days[0]).toEqual({ date: '2026-07-01', pm25: 19.4, aqiCategory: 'Moderate' });
  });

  it('returns an empty series for no data, without throwing', () => {
    expect(() => summarizeCamsSummary(EMPTY_CAMS_SUMMARY)).not.toThrow();
    expect(summarizeCamsSummary(EMPTY_CAMS_SUMMARY)).toEqual({ total: 0, days: [] });
  });
});

describe('emptyCamsSummarySeries', () => {
  it('represents "no data" with zero days', () => {
    expect(emptyCamsSummarySeries()).toEqual({ total: 0, days: [] });
  });
});

describe('createGetCamsSummaryHandler', () => {
  it('fetches and summarizes on the happy path', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: TEN_DAY_CAMS_SUMMARY } });
    const handler = createGetCamsSummaryHandler({ client: fakeClient(get) });

    const result = await handler({ start: '2026-07-01', end: '2026-07-10' });

    expect(get).toHaveBeenCalledWith('/api/cams/summary', {
      start: '2026-07-01',
      end: '2026-07-10',
    });
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(10);
  });

  it(`accepts a range exactly at the ${CAMS_SUMMARY_RANGE_MAX_DAYS}-day cap`, async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: EMPTY_CAMS_SUMMARY } });
    const handler = createGetCamsSummaryHandler({ client: fakeClient(get) });

    const result = await handler({ start: '2026-01-01', end: '2026-05-20' });

    expect(result.isError).toBeUndefined();
    expect(get).toHaveBeenCalled();
  });

  it('rejects a range one day over the cap without ever calling the client', async () => {
    const get = vi.fn();
    const handler = createGetCamsSummaryHandler({ client: fakeClient(get) });

    const result = await handler({ start: '2026-01-01', end: '2026-05-21' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
    const text = result.content[0];
    expect(text.type).toBe('text');
    if (text.type === 'text') {
      expect(text.text).toContain(`maximum of ${CAMS_SUMMARY_RANGE_MAX_DAYS} days`);
    }
  });

  it('rejects an invalid calendar date without ever calling the client', async () => {
    const get = vi.fn();
    const handler = createGetCamsSummaryHandler({ client: fakeClient(get) });

    const result = await handler({ start: '2026-02-25', end: '2026-02-30' });

    expect(result.isError).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it('treats a 404 as "not ingested yet" rather than an error', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });
    const handler = createGetCamsSummaryHandler({ client: fakeClient(get) });

    const result = await handler({ start: '2099-01-01', end: '2099-01-05' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe('No CAMS summary data ingested for 2099-01-01–2099-01-05 yet.');
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetCamsSummaryHandler({ client: fakeClient(get) });

    const result = await handler({ start: '2026-07-01', end: '2026-07-10' });

    expect(result.isError).toBe(true);
  });

  it('treats a malformed (non-array) success body as an empty series rather than throwing', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: null });
    const handler = createGetCamsSummaryHandler({ client: fakeClient(get) });

    const result = await handler({ start: '2026-07-01', end: '2026-07-10' });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(0);
  });
});
