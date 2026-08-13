import { describe, expect, it, vi } from 'vitest';

import type { FahsaiClient } from '../fahsai-client/client.js';
import { EMPTY_FIRES, LARGE_FIRES, SMALL_FIRES } from './handler.fixtures.js';
import {
  CONFIRMED_EMPTY_FIRE_AREA_NOTE,
  emptyFireSummary,
  FIRE_LIST_TRUNCATION_THRESHOLD,
  fetchAndSummarizeFires,
  filterByConfidence,
  isPeriodIngested,
  summarizeFires,
} from './handler.js';

describe('summarizeFires', () => {
  it('summarizes an empty day with zero counts and no truncation', () => {
    const summary = summarizeFires(EMPTY_FIRES);

    expect(summary).toEqual({
      total: 0,
      byConfidence: { high: 0, nominal: 0, low: 0, unknown: 0 },
      points: [],
      truncated: false,
    });
  });

  it('returns the full trimmed list and confidence breakdown when under the threshold', () => {
    const summary = summarizeFires(SMALL_FIRES);

    expect(summary.total).toBe(4);
    expect(summary.truncated).toBe(false);
    expect(summary.note).toBeUndefined();
    expect(summary.byConfidence).toEqual({ high: 1, nominal: 1, low: 1, unknown: 1 });
    expect(summary.points).toHaveLength(4);
    expect(summary.points[0]).toEqual({
      id: 1,
      detectedAt: '2026-04-18T06:12:00Z',
      lat: 18.7883,
      lng: 98.9853,
      frp: 5,
      confidence: 'high',
      daynight: 'D',
    });
  });

  it('buckets an unrecognized raw confidence code as unknown', () => {
    const summary = summarizeFires([{ ...SMALL_FIRES[0], confidence: 'x' }]);

    expect(summary.byConfidence).toEqual({ high: 0, nominal: 0, low: 0, unknown: 1 });
    expect(summary.points[0].confidence).toBeNull();
  });

  it('truncates to the top-N by FRP (descending) when over the threshold, noting the omitted count', () => {
    const summary = summarizeFires(LARGE_FIRES);

    expect(summary.total).toBe(60);
    expect(summary.truncated).toBe(true);
    expect(summary.points).toHaveLength(FIRE_LIST_TRUNCATION_THRESHOLD);
    expect(summary.note).toBe(
      'Showing the top 50 fires by fire radiative power (FRP); 10 more fire(s) omitted.',
    );
    // Highest FRP (59, id 60) first; lowest surviving FRP (10, id 11) last.
    expect(summary.points[0]).toMatchObject({ id: 60, frp: 59 });
    expect(summary.points[summary.points.length - 1]).toMatchObject({ id: 11, frp: 10 });
  });

  it('sorts a null-FRP point last, dropping it first when truncating', () => {
    const withDistinctFrp = Array.from({ length: 50 }, (_, i) => ({
      ...SMALL_FIRES[0],
      id: i + 1,
      frp: 50 - i,
    }));
    const points = [...withDistinctFrp, { ...SMALL_FIRES[0], id: 51, frp: null }];

    const summary = summarizeFires(points);

    expect(summary.total).toBe(51);
    expect(summary.truncated).toBe(true);
    expect(summary.points).toHaveLength(50);
    expect(summary.points.map((p) => p.id)).not.toContain(51);
    expect(summary.points[0]).toMatchObject({ id: 1, frp: 50 });
    expect(summary.points[49]).toMatchObject({ id: 50, frp: 1 });
  });
});

describe('emptyFireSummary', () => {
  it('returns a zeroed summary with an empty point list', () => {
    expect(emptyFireSummary()).toEqual({
      total: 0,
      byConfidence: { high: 0, nominal: 0, low: 0, unknown: 0 },
      points: [],
      truncated: false,
    });
  });
});

describe('filterByConfidence', () => {
  it('returns all points unchanged when no filter is given', () => {
    expect(filterByConfidence(SMALL_FIRES, undefined)).toEqual(SMALL_FIRES);
    expect(filterByConfidence(SMALL_FIRES, [])).toEqual(SMALL_FIRES);
  });

  it('keeps only points whose raw confidence code maps into the requested labels', () => {
    // SMALL_FIRES: id1='h', id2='n', id3='l', id4=null
    const filtered = filterByConfidence(SMALL_FIRES, ['high', 'low']);

    expect(filtered.map((p) => p.id)).toEqual([1, 3]);
  });

  it('excludes points with a null or unrecognized confidence code even if not explicitly filtered out', () => {
    const filtered = filterByConfidence(SMALL_FIRES, ['nominal']);

    expect(filtered.map((p) => p.id)).toEqual([2]);
  });
});

function fakeClient(get: FahsaiClient['get']): FahsaiClient {
  return { get };
}

describe('isPeriodIngested', () => {
  it('returns true when the full-coverage-bbox confirmation call succeeds', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: [] } });

    const confirmed = await isPeriodIngested(fakeClient(get), '/api/fires', {
      date: '2026-08-12',
      bbox: '99.39,19.94,100.38,20.94',
    });

    expect(confirmed).toBe(true);
    expect(get).toHaveBeenCalledWith('/api/fires', {
      date: '2026-08-12',
      bbox: '89,1,114,30',
    });
  });

  it('returns false when the confirmation call also 404s', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });

    const confirmed = await isPeriodIngested(fakeClient(get), '/api/fires', {
      date: '2099-01-01',
      bbox: '99.39,19.94,100.38,20.94',
    });

    expect(confirmed).toBe(false);
  });
});

describe('fetchAndSummarizeFires', () => {
  it('unwraps the {data: [...]} response envelope and summarizes it', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_FIRES } });

    const result = await fetchAndSummarizeFires(
      fakeClient(get),
      '/api/fires',
      { date: '2026-04-18' },
      undefined,
      'not found',
    );

    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(4);
  });

  it('filters client-side without sending a confidence param, since the API param has no effect', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { data: SMALL_FIRES } });

    const result = await fetchAndSummarizeFires(
      fakeClient(get),
      '/api/fires',
      { date: '2026-04-18' },
      ['high'],
      'not found',
    );

    expect(get).toHaveBeenCalledWith('/api/fires', { date: '2026-04-18' });
    const structured = result.structuredContent as { total: number };
    expect(structured.total).toBe(1);
  });

  it('combines the location note with the not-ingested-yet note when the confirmation call also 404s', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });

    const result = await fetchAndSummarizeFires(
      fakeClient(get),
      '/api/fires',
      { date: '2099-01-01' },
      undefined,
      'No fire data ingested for 2099-01-01 yet.',
      '`place` was ignored because `bbox` was provided directly.',
    );

    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe(
      '`place` was ignored because `bbox` was provided directly. No fire data ingested for 2099-01-01 yet.',
    );
    // params has no `bbox`, so it never matches the full-coverage bbox — a confirmation call is
    // attempted (and also 404s here), not skipped.
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('reports the confirmed-empty-area note when a 404 against a small bbox is followed by a successful full-bbox confirmation', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'not-found', status: 404, message: 'No data' },
      })
      .mockResolvedValueOnce({ ok: true, value: { data: [] } });

    const result = await fetchAndSummarizeFires(
      fakeClient(get),
      '/api/fires',
      { date: '2026-08-12', bbox: '99.39,19.94,100.38,20.94' },
      undefined,
      'No fire data ingested for 2026-08-12 yet.',
    );

    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.total).toBe(0);
    expect(structured.note).toBe(CONFIRMED_EMPTY_FIRE_AREA_NOTE);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(2, '/api/fires', {
      date: '2026-08-12',
      bbox: '89,1,114,30',
    });
  });

  it('skips the confirmation call and keeps the original note when the request already used the full coverage bbox', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'No data' },
    });

    const result = await fetchAndSummarizeFires(
      fakeClient(get),
      '/api/fires',
      { date: '2099-01-01', bbox: '89,1,114,30' },
      undefined,
      'No fire data ingested for 2099-01-01 yet.',
    );

    const structured = result.structuredContent as { total: number; note?: string };
    expect(structured.note).toBe('No fire data ingested for 2099-01-01 yet.');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });

    const result = await fetchAndSummarizeFires(
      fakeClient(get),
      '/api/fires',
      { date: '2026-04-18' },
      undefined,
      'not found',
    );

    expect(result.isError).toBe(true);
    // Non-404 errors never trigger a confirmation call.
    expect(get).toHaveBeenCalledTimes(1);
  });
});
