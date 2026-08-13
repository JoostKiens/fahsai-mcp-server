import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNominatimClient } from './nominatim-client.js';

describe('createNominatimClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns matches and sets an identifying User-Agent header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve([{ lat: '18.7883', lon: '98.9853', display_name: 'Chiang Mai, Thailand' }]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('Chiang Mai');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value).toHaveLength(1);
    expect(result.value[0].display_name).toBe('Chiang Mai, Thailand');

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain('nominatim.openstreetmap.org/search');
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('fahsai-mcp-server');
  });

  it('returns an empty array as a success result when there is no match', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('asdkjfhaklsdjfh');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value).toHaveLength(0);
  });

  it('returns multiple matches when the query is ambiguous', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve([
          { lat: '39.7817', lon: '-89.6501', display_name: 'Springfield, Illinois, USA' },
          { lat: '42.1015', lon: '-72.5898', display_name: 'Springfield, Massachusetts, USA' },
        ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('Springfield');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value).toHaveLength(2);
  });

  it('types a non-2xx response as a nominatim-error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('Bangkok');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error result');
    expect(result.error.kind).toBe('nominatim-error');
    expect(result.error.message).toContain('503');
  });

  it('types a network failure distinctly, without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('Bangkok');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error result');
    expect(result.error.kind).toBe('network');
    expect(result.error.message).toContain('ENOTFOUND');
  });

  it('returns a typed error instead of throwing when the response body is not valid JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('Bangkok');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error result');
    expect(result.error.kind).toBe('nominatim-error');
    expect(result.error.message).toContain('could not be parsed');
  });

  it('types a non-array response body as a nominatim-error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ error: 'Unable to geocode' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('???');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected error result');
    expect(result.error.kind).toBe('nominatim-error');
    expect(result.error.message).toContain('non-array');
  });

  it('drops malformed entries while keeping valid matches in the same response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () =>
        Promise.resolve([
          { lat: 'not-a-number', lon: '98.9853', display_name: 'Malformed Entry' },
          null,
          { lat: '18.7883', lon: '98.9853', display_name: 'Chiang Mai, Thailand' },
        ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const result = await client.search('Chiang Mai');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected success result');
    expect(result.value).toHaveLength(1);
    expect(result.value[0].display_name).toBe('Chiang Mai, Thailand');
  });

  it('serializes back-to-back requests at least 1 second apart', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = createNominatimClient();
    const first = client.search('Bangkok');
    const second = client.search('Chiang Mai');

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await Promise.all([first, second]);
  });
});
