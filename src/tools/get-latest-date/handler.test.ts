import { describe, expect, it, vi } from 'vitest';

import { fakeClient } from '../../shared/fahsai-client/client.fixtures.js';
import { createGetLatestDateHandler } from './handler.js';
import { LATEST_DATE_GATING_NOTE } from './schema.js';

describe('createGetLatestDateHandler', () => {
  it('fetches and returns the date with the static gating note', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: { date: '2026-07-28' } });
    const handler = createGetLatestDateHandler({ client: fakeClient(get) });

    const result = await handler();

    expect(get).toHaveBeenCalledWith('/api/latest-date');
    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { date: string; note: string };
    expect(structured.date).toBe('2026-07-28');
    expect(structured.note).toBe(LATEST_DATE_GATING_NOTE);
  });

  it('returns isError for a non-404 Fahsai error', async () => {
    const get = vi.fn().mockResolvedValue({
      ok: false,
      error: { kind: 'server-error', status: 500, message: 'Fahsai API server error' },
    });
    const handler = createGetLatestDateHandler({ client: fakeClient(get) });

    const result = await handler();

    expect(result.isError).toBe(true);
  });

  it('returns isError for a malformed success body missing `date`', async () => {
    const get = vi.fn().mockResolvedValue({ ok: true, value: {} });
    const handler = createGetLatestDateHandler({ client: fakeClient(get) });

    const result = await handler();

    expect(result.isError).toBe(true);
  });
});
