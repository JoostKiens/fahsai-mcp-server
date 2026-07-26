import type { Result } from '../result.js';

export interface NominatimMatch {
  readonly lat: string;
  readonly lon: string;
  readonly display_name: string;
}

export type NominatimError =
  | { readonly kind: 'network'; readonly message: string }
  | { readonly kind: 'nominatim-error'; readonly message: string };

export interface NominatimClient {
  readonly search: (query: string) => Promise<Result<readonly NominatimMatch[], NominatimError>>;
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const REQUEST_TIMEOUT_MS = 30_000;
const MIN_REQUEST_INTERVAL_MS = 1000; // Nominatim usage policy: max 1 request/sec.
const SEARCH_LIMIT = 5;
const USER_AGENT = 'fahsai-mcp-server/0.1.0 (+https://github.com/JoostKiens/fahsai-mcp-server)';

export function createNominatimClient(): NominatimClient {
  let nextAvailableAt = 0;
  let queue: Promise<void> = Promise.resolve();

  // Serializes requests through this client instance so concurrent resolve() calls
  // still respect Nominatim's 1 req/sec policy instead of racing past it.
  function waitForSlot(): Promise<void> {
    const turn = queue.then(async () => {
      const waitMs = Math.max(0, nextAvailableAt - Date.now());
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      nextAvailableAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
    });
    queue = turn;
    return turn;
  }

  async function search(query: string): Promise<Result<readonly NominatimMatch[], NominatimError>> {
    await waitForSlot();

    const url = new URL('/search', NOMINATIM_BASE_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', String(SEARCH_LIMIT));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      return {
        ok: false,
        error: { kind: 'network', message: `Request to Nominatim failed: ${message}` },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          kind: 'nominatim-error',
          message: `Nominatim returned ${response.status} ${response.statusText}`,
        },
      };
    }

    try {
      const matches = (await response.json()) as NominatimMatch[];
      return { ok: true, value: matches };
    } catch {
      return {
        ok: false,
        error: {
          kind: 'nominatim-error',
          message: 'Nominatim returned a response that could not be parsed as JSON.',
        },
      };
    }
  }

  return { search };
}
