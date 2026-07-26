# Fahsai API reference

Copy-paste-and-reformat of the relevant sections of `fahsai`'s own `docs/claude/architecture.md`, as verified 2026-07-25 against the live repo. **Treat this as a starting point, not ground truth** — verify against the live API (`npm run test:live`) before shipping a param name or response-shape assumption pulled from here. If this doc turns out wrong, fix it in place with a note on what was verified and when.

**Base URL correction (verified 2026-07-25, JOO-25)**: the actual API is deployed on Railway at `https://api-server-service-production.up.railway.app` — every route below is relative to that host, not `fahsai.fyi` (the frontend domain returns a platform 404 for all of them; it doesn't proxy the API). Also verified live: responses are JSON; app-level errors are shaped `{"error": "<message>"}` (e.g. a missing `date` param on `/api/weather` is a `400` with `{"error":"date param required (YYYY-MM-DD)"}`, and a valid-but-not-yet-ingested date is a `404` with `{"error":"No weather data for this date. Run the ingest job."}`); an unmatched route hits the framework's own 404 handler instead, shaped `{"message": "...", "error": "Not Found", "statusCode": 404}`. No field is guaranteed present on every error body — `fahsai-client` extracts `message` then `error` then falls back to `statusText`.

All routes return JSON. All accept a `bbox` query param where spatial filtering applies (format: `west,south,east,north`, default `89,1,114,30` — covers Thailand, Myanmar, Laos, Cambodia, and partial Vietnam/India/China/Bangladesh). This server's `place-resolver` converts a `place` string to this same format before calling.

## Routes this server wraps

```
GET /api/fires?date=YYYY-MM-DD&bbox=...
  Fire points for a date. Optional confidence=high,nominal filter.
  → get_fires

GET /api/fires/range?start=YYYY-MM-DD&end=YYYY-MM-DD&bbox=...
  Fire points for a date range. Max 10 days (enforce client-side).
  → get_fires_range

GET /api/station-readings/latest?parameter=pm25&bbox=...&date=YYYY-MM-DD
  Latest measurement per station. date optional (last 24h if absent).
  → get_station_readings

GET /api/station-readings/history?station_id=...&parameter=pm25&hours=24
  Raw time series for a single station. Requires station_id. Max 168 hours / 7 days
  (enforce client-side; the API itself 400s above that).
  → get_station_readings_history

GET /api/stations/:stationId/history?days=7&date=YYYY-MM-DD
  Daily rollup, wrapped as { stationId, days: [...] }, each day
  { date, pm25, readingCount, weather: {...} | null, baseline: BaselineStat | null }.
  `days` default 7, max 30 (400 above that). `date` is the inclusive end-anchor; `days` counts
  backward from it. Requires station_id.
  → get_station_history

GET /api/stations/:stationId/baseline
  { data: 365 rows (one per calendar day, no Feb 29): { month, day, medianPm25, p25Pm25, p75Pm25, n },
  minYear, maxYear }. `n` varies widely (observed 3–67 on one station; a large share of rows can
  be n<30 — a common case, not an edge case). Requires station_id.
  → get_station_baseline

GET /api/stations?bbox=...
  All stations with available parameters.
  → get_stations

GET /api/weather?date=YYYY-MM-DD&bbox=...
  Weather grid. date REQUIRED (400 if absent). 404 if not yet ingested for that date.
  → get_weather

GET /api/cams?date=YYYY-MM-DD&bbox=...
  CAMS gridded PM2.5 model (up to 4,599 points).
  → get_cams

GET /api/cams/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
  Daily p95 PM2.5 time series. Max 130 days (enforce client-side).
  → get_cams_summary

GET /api/power-plants
  WRI power plants (Coal/Gas/Oil), THA/MMR/LAO/KHM, GeoJSON FeatureCollection. No bbox param on
  the API side — this server filters client-side when place/bbox given.
  → get_power_plants

GET /api/latest-date
  Most recent date with complete data across fires/CAMS/station_readings.
  → get_latest_date
```

## Routes this server deliberately does NOT wrap

```
POST /api/explain
  Gemini-streamed AQI explanation. Shared 500 req/Bangkok-day quota with fahsai.fyi's real users.
  SSE-streamed. Excluded per CLAUDE.md's non-negotiable constraints — see architecture.md.

GET /health
  Liveness check. No LLM-facing value.
```

## Not a route at all — also excluded

**Urban/industrial center data** (`packages/backend/src/data/urbanSources.ts`) is a static, hand-maintained list used only inside `/api/explain`'s prompt-context assembly (population/emissions-weighted influence score, upwind detection against the trajectory ensemble — see `fahsai`'s `docs/claude/explain.md`). It is never returned by any public route, so there's nothing to wrap. It was considered and explicitly rejected as a bundle-a-static-copy candidate: unlike the WRI power-plant data (sourced from a public dataset with a check-and-refresh path), `urbanSources.ts` is explicitly marked "do not sync from external source" in its own repo — a vendored copy here would have no way to detect drift from Fahsai's canonical version.

## Response shapes worth knowing (from `fahsai`'s `docs/claude/types.md`)

```typescript
// What /api/fires and /api/fires/range actually return — CORRECTED 2026-07-26 against the
// live API (JOO-29). Two things this doc previously got wrong:
//   1. The response is wrapped as { data: FirePoint[] }, not a bare array.
//   2. FirePoint has no brightTi4, brightTi5, countryId, or satellite fields, and
//      `confidence` is a raw single-letter FIRMS code ('l' | 'n' | 'h' | null), not the
//      full word — this server maps it to 'low' | 'nominal' | 'high' before returning it.
// Also verified: the `confidence` query param has no observed server-side filtering effect
// (identical results whether passed as words, letter codes, or omitted) — this server
// filters client-side instead (see src/logic/fires.ts's filterByConfidence).
interface FirePoint {
  id: number;
  detectedAt: string;        // ISO 8601
  lat: number;
  lng: number;
  frp: number | null;        // fire radiative power, MW — use for top-N ranking when summarizing
  confidence: string | null; // raw FIRMS code: 'l' | 'n' | 'h' | null
  daynight: string | null;
}

// What /api/station-readings/latest returns — VERIFIED 2026-07-26 (JOO-30) against the live
// API, 303 stations across the full SEA bbox; this doc previously had no entry for this route
// at all. Notable findings:
//   1. The response is wrapped as { data: StationReadingLatest[] }, matching the { data }
//      wrapper /api/fires also uses (see FirePoint above).
//   2. The `parameter` query param appears to be a server-side no-op: `pm25`, `pm10`, a
//      bogus value, and omitting it entirely all returned byte-identical results.
//   3. `attribution` was not present on any of the 303 stations sampled. It's kept in the
//      type below (typed loosely, not assumed to be a string) because it's a real, if rare,
//      per-station OpenAQ quirk — see "Known upstream gotchas" below — that must be passed
//      through when present, not dropped.
interface StationReadingLatest {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  country: string;
  value: number; // pm25 µg/m³ — pipe through logic/aqi.ts before returning
  measuredAt: string; // ISO 8601
  attribution?: unknown; // never observed live; pass through opaquely when present
}

// What /api/station-readings/history returns — VERIFIED 2026-07-26 (JOO-31) against the live
// API, 10+ stations including full 168-hour windows. Leaner than StationReadingLatest above —
// no stationName/lat/lng/country/attribution, just the series for the one station requested.
// The `parameter` query param is confirmed a no-op here too (byte-identical results for
// pm25/pm10/bogus/omitted against the same station+window), same finding as /latest (JOO-30).
// Unlike /latest, an invalid/nonexistent station_id does NOT 404 — it returns 200 with an
// empty `data` array, same as a valid station_id with nothing ingested for the window yet;
// the API gives no way to distinguish the two.
interface StationReadingHistory {
  stationId: string;
  value: number; // pm25 µg/m³ — pipe through logic/aqi.ts before returning
  measuredAt: string; // ISO 8601
}

// What /api/stations returns (array of):
interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  provider: string | null;
  isMobile: boolean;   // flag distinctly — a mobile station's location isn't fixed
  isMonitor: boolean | null;
  parameters: string[];
}

// What /api/stations/:id/history returns — VERIFIED 2026-07-26 (JOO-32) against the live API.
// Two things this doc previously got wrong: the response is wrapped as { stationId, days: [...] },
// not a bare array; and the PM2.5 field is `pm25`, not `meanPm25`.
// Also verified: `pm25: 0` paired with `readingCount: 0` is a sentinel for "no reading ingested
// that day" — a bogus station_id returns this pair for every day, and a real station with a
// lapsed feed shows the same pair for its un-ingested recent days (while `weather` can still be
// non-null for those days — weather comes from a separate source, decoupled from PM2.5 ingestion).
// Don't classify this sentinel 0 as a real "Good" reading — treat readingCount:0 as null pm25/aqi.
interface StationHistoryApiResponse {
  stationId: string;
  days: StationDayHistory[];
}
interface StationDayHistory {
  date: string;
  pm25: number;               // 0 + readingCount:0 means "no data", not a real zero reading
  readingCount: number;
  weather: {
    windSpeedKmh: number | null;
    windDirectionDeg: number | null; // pipe through logic/wind.ts — never surface raw
    precipitationSumMm: number | null;
    relativeHumidity2m: number | null;
  } | null;
  baseline: { medianPm25: number; p25Pm25: number; p75Pm25: number; n: number } | null;
}

// What /api/stations/:id/baseline returns — VERIFIED 2026-07-26 (JOO-32) against the live API,
// station 225572: exactly 365 rows (no Feb 29), n ranging 3–67, minYear 2021, maxYear 2026.
// Invalid/nonexistent station_id doesn't 404 — same gotcha as /station-readings/history — it
// returns 200 with { data: [], minYear: null, maxYear: null }.
interface StationBaselineApiResponse {
  data: { month: number; day: number; medianPm25: number; p25Pm25: number; p75Pm25: number; n: number }[];
  minYear: number | null;
  maxYear: number | null;
}

// What /api/weather returns (array of):
interface WindVector {
  lat: number;
  lng: number;
  speedKmh: number;
  directionDeg: number; // meteorological: 0=N, 90=E, 180=S, 270=W — FROM direction
}

// What /api/cams returns (array of):
interface PM25GridPoint {
  lat: number;
  lng: number;
  pm25: number; // daily mean µg/m³, CAMS model via Open-Meteo — a model estimate, not a measurement
}
```

## AQI thresholds (US EPA, from `fahsai`'s `docs/claude/frontend.md`)

Raw PM2.5 µg/m³, not AQI index values. This is what `logic/aqi.ts` implements — don't reference this table directly in tool code, go through the shared module.

| Category                     | PM2.5 µg/m³ |
| ---------------------------- | ----------- |
| Good                         | 0–12.0      |
| Moderate                     | 12.1–35.4   |
| Unhealthy (sensitive groups) | 35.5–55.4   |
| Unhealthy                    | 55.5–150.4  |
| Very unhealthy               | 150.5–250.4 |
| Hazardous                    | 250.5+      |

## Wind direction convention (from `fahsai`'s `docs/claude/conventions.md`)

`directionDeg` is always the direction wind is coming **FROM**. Never apply `+ 180` to produce a display label — that's the TO direction, and it's non-standard for a "from" label even though it looks visually correct next to a particle animation. This exact mistake shipped twice on the Fahsai frontend before being centralized into `parseWindDir`. This server's `logic/wind.ts` is the equivalent centralization here.

## Known upstream gotchas worth carrying over

- **Attribution**: OpenAQ readings sometimes carry a per-station `attribution` field with requirements beyond the blanket CC BY 4.0 footer note — surface it per-station if present, don't drop it. Not observed on any of 303 live stations sampled 2026-07-26 (JOO-30); `get_station_readings` still passes it through opaquely as a defensive measure.
- **CAMS is a model, station readings are measurements.** Don't let a tool response or description blur this distinction — an LLM conflating "the model says X" with "a station measured X" is a plausible and consequential mistake.
- **Ingestion runs on a schedule.** A 404 on a date-scoped route very often means "not ingested yet," not "no data exists" — see `get_latest_date` as the tool to check first when a caller says "today" without a specific date in mind.
- **`/api/station-readings/history`'s observed cadence is daily, not hourly**, despite the route's `hours` window param — verified 2026-07-26 (JOO-31) across 10+ stations, including full 168-hour windows, every series returned at most one point per calendar day (`00:00:00Z`). True intraday granularity may exist for some provider but wasn't observed anywhere. `get_station_readings_history` doesn't assume hourly cadence — it summarizes whatever points the API actually returns, and its description discloses this to the caller.