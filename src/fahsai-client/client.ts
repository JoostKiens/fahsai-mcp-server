import type { Result } from '../result.js';

export type FahsaiQueryParams = Record<string, string | number | boolean | undefined>;

export type FahsaiError =
  | { readonly kind: 'not-found'; readonly status: 404; readonly message: string }
  | { readonly kind: 'client-error'; readonly status: number; readonly message: string }
  | { readonly kind: 'server-error'; readonly status: number; readonly message: string }
  | { readonly kind: 'network'; readonly message: string };

export interface FahsaiClient {
  readonly get: <T = unknown>(path: string, params?: FahsaiQueryParams) => Promise<Result<T, FahsaiError>>;
}

// Fahsai's backend URL — every user of this server talks to the same one, so this
// is a fixed implementation detail, not something to expose via env var. If Fahsai
// moves hosts again, this is the one place to update.
export const BASE_URL = 'https://api-server-service-production.up.railway.app';

function buildUrl(baseUrl: string, path: string, params?: FahsaiQueryParams): string {
  const url = new URL(path, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

// Fahsai's API isn't guaranteed to return any particular field on an error body
// (app errors use `{ error }`, the framework's own 404 also adds `message`/`statusCode`) —
// try both, never pass the raw body through to callers.
function extractMessage(bodyText: string, statusText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.message === 'string') {
        return obj.message;
      }
      if (typeof obj.error === 'string') {
        return obj.error;
      }
    }
  } catch {
    // Not JSON — no message to extract.
  }
  return statusText || 'Unknown error';
}

function normalizeError(status: number, bodyText: string, statusText: string): FahsaiError {
  const message = extractMessage(bodyText, statusText);

  if (status === 404) {
    return { kind: 'not-found', status: 404, message };
  }

  if (status >= 500) {
    return { kind: 'server-error', status, message: `Fahsai API server error (${status}): ${message}` };
  }

  return { kind: 'client-error', status, message: `Fahsai API rejected the request (${status}): ${message}` };
}

export function createFahsaiClient(): FahsaiClient {
  async function get<T>(path: string, params?: FahsaiQueryParams): Promise<Result<T, FahsaiError>> {
    const url = buildUrl(BASE_URL, path, params);

    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error';
      return { ok: false, error: { kind: 'network', message: `Request to Fahsai API failed: ${message}` } };
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      return { ok: false, error: normalizeError(response.status, bodyText, response.statusText) };
    }

    try {
      const value = (await response.json()) as T;
      return { ok: true, value };
    } catch {
      return {
        ok: false,
        error: {
          kind: 'server-error',
          status: response.status,
          message: 'Fahsai API returned a response that could not be parsed as JSON.',
        },
      };
    }
  }

  return { get };
}
