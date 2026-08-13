import type { FahsaiClient, FahsaiError } from './fahsai-client/client.js';
import type { Result } from './result.js';

// Bare { date }, no per-source breakdown — verified 2026-07-29, JOO-36 (see
// fahsai-api-reference.md).
export interface LatestDateApiResponse {
  readonly date: string;
}

// Shared by every caller that needs "latest" to mean an actual date rather than an
// omitted `date` param — /api/station-readings/latest 404s when `date` is omitted
// instead of falling back to a rolling window (verified 2026-08-02, JOO-38; see
// fahsai-api-reference.md's station-readings/latest entry).
export async function fetchLatestDate(client: FahsaiClient): Promise<Result<string, FahsaiError>> {
  const result = await client.get<LatestDateApiResponse>('/api/latest-date');
  if (!result.ok) return result;

  if (typeof result.value?.date !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'server-error',
        status: 200,
        message: 'Fahsai API returned an unexpected /api/latest-date response.',
      },
    };
  }

  return { ok: true, value: result.value.date };
}

// Resolves `date` if given, otherwise fetches the latest available date — the fallback needed
// by every caller for whom the underlying endpoint 404s on an omitted date rather than
// defaulting to a rolling window (see fetchLatestDate above). A no-op (no network call) once a
// date is already known, so calling this again after an earlier resolution costs nothing extra.
export async function resolveDateOrLatest(
  client: FahsaiClient,
  date: string | undefined,
): Promise<Result<string, FahsaiError>> {
  if (date !== undefined) return { ok: true, value: date };
  return fetchLatestDate(client);
}
