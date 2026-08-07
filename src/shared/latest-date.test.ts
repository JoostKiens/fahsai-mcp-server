import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from './fahsai-client/client.fixtures.js';
import { fetchLatestDate } from './latest-date.js';

describe('fetchLatestDate', () => {
  it('unwraps the date on a well-formed response', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { date: '2026-07-28' } });

    const result = await fetchLatestDate(fakeClient(get));

    expect(result).toEqual({ ok: true, value: '2026-07-28' });
    expect(get).toHaveBeenCalledWith('/api/latest-date');
  });

  it('propagates a FahsaiError unchanged', async () => {
    const fahsaiError = {
      ok: false,
      error: { kind: 'server-error' as const, status: 500, message: 'Fahsai API server error' },
    };
    const get = vi.fn().mockResolvedValue(fahsaiError);

    const result = await fetchLatestDate(fakeClient(get));

    expect(result).toEqual(fahsaiError);
  });

  it('returns a server-error when the response body is missing `date`', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: {} });

    const result = await fetchLatestDate(fakeClient(get));

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'server-error',
        status: 200,
        message: 'Fahsai API returned an unexpected /api/latest-date response.',
      },
    });
  });

  it('returns a server-error when `date` is present but not a string', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { date: null } });

    const result = await fetchLatestDate(fakeClient(get));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected failure result');
    expect(result.error.kind).toBe('server-error');
  });
});
