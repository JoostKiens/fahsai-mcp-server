import { describe, expect, it, vi } from 'vitest';

import type { FahsaiClient } from './fahsai-client/client.js';
import { fetchAndSummarize } from './fetch-summarize.js';

function fakeClient(get: FahsaiClient['get']): FahsaiClient {
  return { get };
}

interface FakeRaw {
  readonly items: readonly number[];
}

interface FakeSummary {
  readonly total: number;
  readonly note?: string;
}

function summarize(raw: FakeRaw): FakeSummary {
  return { total: raw.items.length };
}

const EMPTY: FakeSummary = { total: 0 };

describe('fetchAndSummarize', () => {
  it('extracts, summarizes, and responds on success', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { items: [1, 2, 3] } });

    const result = await fetchAndSummarize(fakeClient(get), '/x', { date: '2026-01-01' }, {
      extractData: (body) => body as FakeRaw,
      summarize,
      emptySummary: EMPTY,
      notFoundNote: 'not found',
    });

    expect(get).toHaveBeenCalledWith('/x', { date: '2026-01-01' });
    expect(result.structuredContent).toEqual({ total: 3 });
  });

  it('returns emptySummary + notFoundNote on a not-found error, combined with locationNote', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'not-found', status: 404, message: 'no data' },
    });

    const result = await fetchAndSummarize(fakeClient(get), '/x', {}, {
      extractData: (body) => body as FakeRaw,
      summarize,
      emptySummary: EMPTY,
      notFoundNote: 'No data for this date.',
      locationNote: '`place` was ignored because `bbox` was provided directly.',
    });

    expect(result.structuredContent).toEqual({
      total: 0,
      note: '`place` was ignored because `bbox` was provided directly. No data for this date.',
    });
  });

  it('returns isError for a non-404 error, without calling extractData or summarize', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const extractData = vi.fn();
    const summarizeSpy = vi.fn(summarize);

    const result = await fetchAndSummarize(fakeClient(get), '/x', {}, {
      extractData,
      summarize: summarizeSpy,
      emptySummary: EMPTY,
      notFoundNote: 'not found',
    });

    expect(result.isError).toBe(true);
    expect(extractData).not.toHaveBeenCalled();
    expect(summarizeSpy).not.toHaveBeenCalled();
  });
});
