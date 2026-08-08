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
  Latest measurement per station. date optional (last 24h if absent) — but VERIFIED
  2026-08-02 (JOO-38) that omitting it 404s the same way an explicit today's-date does
  when today isn't ingested yet, rather than falling back to a rolling last-24h window as
  this doc previously claimed with no observed exception. Passing the prior complete date
  (e.g. from /api/latest-date) succeeded. Re-verify before relying on the omitted-date case.
  → get_station_readings, shared/nearest-station. Both call sites work around this in code
  (JOO-46): when no date is given, they fetch /api/latest-date first and pass that through,
  rather than omitting `date` — this is not an open bug in either, it's already handled.

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
  All stations, wrapped as { data: [...] }. See the corrected Station shape below — VERIFIED
  2026-07-26 (JOO-33); this section previously claimed a bare array and isMobile/isMonitor/
  parameters fields that don't exist on any live station.
  → get_stations

GET /api/weather?date=YYYY-MM-DD&bbox=...
  Weather grid. date REQUIRED (400 if absent). 404 if not yet ingested for that date.
  → get_weather

GET /api/cams?date=YYYY-MM-DD&bbox=... (bbox OPTIONAL) — VERIFIED 2026-07-27 (JOO-35)
  CAMS gridded PM2.5 model (up to 4,599 points; omitting bbox returns the same full
  coverage-area grid as explicitly passing the default FAHSAI_DATA_BBOX). date REQUIRED
  (400 with {"error":"date param required (YYYY-MM-DD)"} if absent).
  → get_cams

GET /api/cams/summary?start=YYYY-MM-DD&end=YYYY-MM-DD — VERIFIED 2026-07-27 (JOO-35)
  Nationwide daily PM2.5 series — a `bbox` param is silently IGNORED (confirmed
  byte-identical responses with/without it), so this route has no area scoping at all.
  Range cap is enforced client-side, but re-verify the exact number live before trusting
  this doc: it was observed live-flipping from 120 to 140 days during JOO-35's own
  development, and its true enforced boundary (139 days succeeds, 140 rejected) is even
  one less than what its own error message claims — see the gotcha below.
  → get_cams_summary

GET /api/power-plants — VERIFIED 2026-07-29 (JOO-36)
  WRI power plants (Coal/Gas/Oil), bare GeoJSON FeatureCollection (not { data: [...] }-wrapped
  like every other array route). This doc previously claimed the dataset was pre-scoped to
  THA/MMR/LAO/KHM — wrong: it's GLOBAL (1,640 features live, mostly China/India), and no
  `bbox`/`country` query param has any effect (confirmed byte-identical responses with/without
  them). This server must filter client-side to FAHSAI_DATA_BBOX (357 of the 1,640 features
  fall inside it) — never assume the API already scoped this for you.
  → get_power_plants

GET /api/latest-date — VERIFIED 2026-07-29 (JOO-36)
  Most recent date with complete data across fires/CAMS/station_readings. Bare
  { date: "YYYY-MM-DD" }, no per-source breakdown despite the stated multi-source gating —
  extra query params are silently ignored (still 200 with the same body).
  → get_latest_date

GET /api/explain/context?stationId=...&lat=...&lng=...&date=YYYY-MM-DD — VERIFIED 2026-08-07
  (JOO-47), both live (5 stations, several explainCase values) and against fahsai's own source
  (github.com/JoostKiens/fahsai, packages/backend/src/lib/buildScientificContext.ts). Returns
  ScientificContext — see the dedicated shape entry below. `stationId`/`lat`/`lng` required
  (400 if missing); `date` optional, defaults to today (Bangkok). 404 (not { error }-wrapped
  ScientificContext) when there's no reading for that station+date. This is a DIFFERENT route
  from `POST /api/explain` below — plain JSON, no Gemini call, no SSE, no shared quota, its own
  dedicated rate limiter (~20 req/min/IP). Do not confuse the two when reading this doc.
  → get_reading_explanation. Requires a resolved station — shared/nearest-station's
  findNearestStation (JOO-46) picks the nearest one to the requested place/bbox with a reading
  for the requested date, within a 50km cutoff, before this route is called.
```

## Routes this server deliberately does NOT wrap

```
POST /api/explain
  Gemini-streamed AQI explanation. Shared 500 req/Bangkok-day quota with fahsai.fyi's real users.
  SSE-streamed. Excluded per CLAUDE.md's non-negotiable constraints — see architecture.md.
  Its sibling GET /api/explain/context (plain JSON, no Gemini call) is NOT excluded — see
  "Routes this server wraps" above; get_reading_explanation (JOO-47) wraps that one instead.

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
// filters client-side instead (see src/shared/fires/handler.ts's filterByConfidence).
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
  value: number; // pm25 µg/m³ — pipe through shared/aqi.ts before returning
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
  value: number; // pm25 µg/m³ — pipe through shared/aqi.ts before returning
  measuredAt: string; // ISO 8601
}

// What /api/stations returns — VERIFIED 2026-07-26 (JOO-33) against the live API (1000+
// stations sampled across the full SEA bbox and a smaller central-Thailand bbox). Two things
// this doc previously got wrong: the response is wrapped as { data: Station[] }, not a bare
// array; and there is no isMobile, isMonitor, or parameters field on any live station — those
// were never real. A no-match bbox is a 200 with an empty `data` array, not a 404.
interface StationsApiResponse {
  data: Station[];
}
interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  provider: string | null;
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
    windDirectionDeg: number | null; // pipe through shared/wind.ts — never surface raw
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

// What /api/weather returns — CORRECTED 2026-07-27 (JOO-34) against the live API (bbox
// 89,1,114,30, full grid sampled). Two things this doc previously got wrong: the response
// is wrapped as { data: WeatherGridPointRaw[] }, not a bare array; and the fields are
// snake_case, not speedKmh/directionDeg — plus two fields (relative_humidity_2m,
// precipitation_sum) that weren't documented at all. Grid size observed: exactly 4,599
// points for the full SEA bbox — the same ceiling documented for /api/cams, so this route
// is subject to CLAUDE.md's "no raw large arrays" constraint just as much as CAMS is.
interface WeatherApiResponse {
  data: WeatherGridPointRaw[];
}
interface WeatherGridPointRaw {
  lat: number;
  lng: number;
  wind_speed_kmh: number;
  wind_direction_deg: number; // meteorological: 0=N, 90=E, 180=S, 270=W — FROM direction
  relative_humidity_2m: number;
  precipitation_sum: number; // mm
}

// What /api/cams returns — CORRECTED 2026-07-27 (JOO-35) against the live API (bbox
// 100,13,101,14 and the full 89,1,114,30 SEA bbox, date=2026-07-26, both sampled). This doc
// previously claimed `data: [{lat,lng,pm25}]` — wrong. The actual response is COLUMNAR: three
// parallel arrays of equal length; the point at index i is
// { lat: lats[i], lng: lngs[i], pm25: pm25s[i] }.
interface CamsApiResponse {
  data: {
    lats: number[];
    lngs: number[];
    pm25s: number[]; // daily mean µg/m³, CAMS model via Open-Meteo — a model estimate, not a
                      // ground-station measurement (see get_station_readings for measured values)
  };
}

// What /api/cams/summary returns — CORRECTED 2026-07-27 (JOO-35) against the live API
// (start=2026-07-01, end=2026-07-10, 10 entries observed). This doc previously had no entry
// for this route's response shape at all.
//   1. Response is { data: [{date, pm25}] } — no separate p95/mean field, just `pm25`.
//   2. Per the ticket author (who also maintains the fahsai backend, confirmed 2026-07-27):
//      this `pm25` value IS the daily p95, despite the field name giving no hint of that.
//   3. `bbox` is a confirmed no-op on this route — byte-identical response with/without it.
//      This route is nationwide-only; there is no way to scope it to a specific area.
//   4. Range cap: observed live-enforced at 120 days early in JOO-35's planning session, then
//      later the SAME session at 140 days (a backend fix landed mid-verification) — and the
//      true boundary at 140 is itself off by one from the API's own error message: a 139-day
//      range succeeds, a 140-day range is rejected with {"error":"range exceeds 140 days"}.
//      DO NOT hardcode a cap number from this doc — curl a range just above and just below
//      whatever this server's constant currently is, immediately before changing it, and use
//      whichever the live API actually enforces.
interface CamsSummaryApiResponse {
  data: { date: string; pm25: number }[]; // pm25 here is actually the daily p95, see note above
}

// What /api/power-plants returns — VERIFIED 2026-07-29 (JOO-36) against the live API (1,640
// features). This doc previously had no entry for this route's shape at all, and separately
// claimed (in this doc and in CLAUDE.md/README.md/package.json) that the dataset itself was
// pre-scoped to Thailand/Myanmar/Laos/Cambodia — also wrong, that framing was never checked
// against the live route. It's a bare FeatureCollection (not { data: [...] }-wrapped), global
// (mostly China/India plants), with no bbox/country query param support — this server filters
// features to FAHSAI_DATA_BBOX client-side (see src/shared/bbox.ts's pointInBbox).
interface PowerPlantsApiResponse {
  type: 'FeatureCollection';
  features: PowerPlantFeature[];
}
interface PowerPlantFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  properties: {
    id: number;
    name: string;
    country: string; // ISO 3166-1 alpha-3, e.g. "THA", "CHN"
    fuel_type: 'Coal' | 'Gas' | 'Oil';
    capacity_mw: number;
    owner: string | null;
    commissioned_year: number | null;
  };
}

// What /api/latest-date returns — VERIFIED 2026-07-29 (JOO-36) against the live API. This doc
// previously had no entry for this route's shape at all. Bare { date }, no per-source
// breakdown despite the route's stated purpose (complete across fires/CAMS/station_readings) —
// get_latest_date adds a static note describing that gating in code, since the API gives
// nothing dynamic to report per source. Extra query params are silently ignored (still 200).
interface LatestDateApiResponse {
  date: string; // YYYY-MM-DD
}

// What /api/explain/context returns — VERIFIED 2026-08-07 (JOO-47) both live (stations 5554536,
// 2843771, 3597974, 3524548, 225569 — covering the transport, stationBaseline, OUTLIER_HIGH,
// persistentWind:null, and tier1/distribution cases) and directly against fahsai's own source
// (buildScientificContext.ts). This is the strongest verification level in this doc: not just
// live sampling, but the actual server-side type definition. Full field-by-field detail (every
// nested interface, exact nullability, source cross-check comments) lives in
// src/tools/get-reading-explanation/schema.ts, not duplicated here — treat that file as the
// canonical copy and this entry as a summary/index into it. Key gotchas worth knowing before
// touching either file:
//   1. Nullability is NOT uniform. Only persistentWind, transport, areaFirePressure, trend,
//      peers, outlier, and stationBaseline can be null at the top level; several of those also
//      have individually-nullable subfields (e.g. transport.fire.recency, peers.range,
//      weatherContext.days[].humidity). Getting this wrong silently strips real data client-side
//      the moment the true value differs from what a Zod schema assumed — see schema.ts's own
//      history of catching exactly this live.
//   2. `outlier` is a discriminated union, not a flat object: `{ type: 'HIGH', ratio, peerTier }`
//      | `{ type: 'LOW', ratio }` | null — `peerTier` does not exist on the LOW branch.
//   3. `explainCase` (OUTLIER_HIGH | OUTLIER_LOW | PLAUSIBLE_FIRE_TRANSPORT |
//      PLAUSIBLE_URBAN_INDUSTRIAL | PLAUSIBLE_CLEAN | PLAUSIBLE_REGIONAL_BACKGROUND |
//      PLAUSIBLE_UNCLEAR, from fahsai's routes/explain.ts) and the upwind-source `type` field
//      (city/coal_plant/gas_plant/oil_plant/industrial, from scripts/eval/types.ts's
//      FixtureUpwindSource) are both known, closed enums at the source today, but are
//      deliberately kept as loose strings in schema.ts — they're owned by a separately-versioned
//      repo that could add a case without this package being updated in lockstep, and a strict
//      Zod enum would turn that into a hard tool-call failure instead of just an under-typed
//      field.
//   4. `stationBaseline.category` (Exclude<BaselineCategory, 'normal'>, from
//      packages/types/src/baseline.ts) IS strictly enumed in schema.ts
//      (wellAbove/above/below/wellBelow) — unlike the two cases above, this is a fixed,
//      IQR-derived statistical classification computed by a pure function, not a growing case
//      taxonomy, so the drift risk that justifies keeping explainCase/type loose doesn't apply.
```

## AQI thresholds (US EPA, from `fahsai`'s `docs/claude/frontend.md`)

Raw PM2.5 µg/m³, not AQI index values. This is what `shared/aqi.ts` implements — don't reference this table directly in tool code, go through the shared module.

| Category                     | PM2.5 µg/m³ |
| ---------------------------- | ----------- |
| Good                         | 0–12.0      |
| Moderate                     | 12.1–35.4   |
| Unhealthy (sensitive groups) | 35.5–55.4   |
| Unhealthy                    | 55.5–150.4  |
| Very unhealthy               | 150.5–250.4 |
| Hazardous                    | 250.5+      |

## Wind direction convention (from `fahsai`'s `docs/claude/conventions.md`)

`directionDeg` is always the direction wind is coming **FROM**. Never apply `+ 180` to produce a display label — that's the TO direction, and it's non-standard for a "from" label even though it looks visually correct next to a particle animation. This exact mistake shipped twice on the Fahsai frontend before being centralized into `parseWindDir`. This server's `shared/wind.ts` is the equivalent centralization here.

## Known upstream gotchas worth carrying over

- **Attribution**: OpenAQ readings sometimes carry a per-station `attribution` field with requirements beyond the blanket CC BY 4.0 footer note — surface it per-station if present, don't drop it. Not observed on any of 303 live stations sampled 2026-07-26 (JOO-30); `get_station_readings` still passes it through opaquely as a defensive measure.
- **CAMS is a model, station readings are measurements.** Don't let a tool response or description blur this distinction — an LLM conflating "the model says X" with "a station measured X" is a plausible and consequential mistake.
- **`/api/cams/summary`'s range cap has been observed changing live** (120→140 days) during active backend development (JOO-35), and its true enforced boundary is one day below what its own error message states (139-day ranges succeed, 140-day ranges are rejected with `{"error":"range exceeds 140 days"}`). Always re-verify live before trusting a hardcoded value in this doc or in `get_cams_summary`'s `CAMS_SUMMARY_RANGE_MAX_DAYS` constant.
- **Ingestion runs on a schedule.** A 404 on a date-scoped route very often means "not ingested yet," not "no data exists" — see `get_latest_date` as the tool to check first when a caller says "today" without a specific date in mind.
- **`/api/station-readings/history`'s observed cadence is daily, not hourly**, despite the route's `hours` window param — verified 2026-07-26 (JOO-31) across 10+ stations, including full 168-hour windows, every series returned at most one point per calendar day (`00:00:00Z`). True intraday granularity may exist for some provider but wasn't observed anywhere. `get_station_readings_history` doesn't assume hourly cadence — it summarizes whatever points the API actually returns, and its description discloses this to the caller.