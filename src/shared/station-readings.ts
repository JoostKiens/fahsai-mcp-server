// What /api/station-readings/latest returns, wrapped as { data: StationReadingLatestRaw[] } —
// verified 2026-07-26 (JOO-30) against the live API, 303 stations across the full SEA bbox.
// `attribution` was never observed on any live station — it's kept here (and typed loosely,
// not assumed to be a string) because fahsai-api-reference.md's "known upstream gotchas"
// section documents it as a real, if rare, per-station OpenAQ quirk that must be passed
// through when present, not dropped.
export interface StationReadingLatestRaw {
  readonly stationId: string;
  readonly stationName: string;
  readonly lat: number;
  readonly lng: number;
  readonly country: string;
  readonly value: number;
  readonly measuredAt: string;
  readonly attribution?: unknown;
}

export interface StationReadingsApiResponse {
  readonly data: readonly StationReadingLatestRaw[];
}
