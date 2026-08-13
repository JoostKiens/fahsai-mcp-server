import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_URL, createFahsaiClient } from './client.js';

describe('createFahsaiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a typed success result and encodes query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ data: [{ id: 1 }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/fires', { date: '2026-04-18', bbox: '89,1,114,30' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected success result');
    }
    expect(result.value).toEqual({ data: [{ id: 1 }] });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/fires?date=2026-04-18&bbox=89%2C1%2C114%2C30`,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('distinguishes 404 no-data as its own error kind', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(JSON.stringify({ error: 'No weather data for this date. Run the ingest job.' })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/weather', { date: '2099-01-01' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected not-found result');
    }
    expect(result.error.kind).toBe('not-found');
    expect(result.error.message).toBe('No weather data for this date. Run the ingest job.');
  });

  it('types a non-404 4xx as a client error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: () => Promise.resolve(JSON.stringify({ error: 'date param required (YYYY-MM-DD)' })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/weather');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected client-error result');
    }
    expect(result.error.kind).toBe('client-error');
    expect(result.error.message).toContain('date param required');
  });

  it('prefers the message field over error when both are present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve(JSON.stringify({ message: 'Rate limited' })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/fires');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected client-error result');
    }
    expect(result.error.message).toContain('Rate limited');
  });

  it('types a 5xx as a server error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/fires');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected server-error result');
    }
    expect(result.error.kind).toBe('server-error');
    expect(result.error.message).toContain('500');
  });

  it('types a network failure distinctly, without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/fires');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected network result');
    }
    expect(result.error.kind).toBe('network');
    expect(result.error.message).toContain('ENOTFOUND');
  });

  it('returns a typed error instead of throwing when a 200 response body is not valid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/fires');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected server-error result');
    }
    expect(result.error.kind).toBe('server-error');
    expect(result.error.message).toContain('could not be parsed');
  });

  it('falls back to the error field when message is an empty string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(JSON.stringify({ message: '', error: 'Not Found' })),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    const result = await client.get('/api/does-not-exist');

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected not-found result');
    }
    expect(result.error.message).toBe('Not Found');
  });

  it('passes an abort signal so a hung request does not block forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createFahsaiClient();
    await client.get('/api/fires');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
