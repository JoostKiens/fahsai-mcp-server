# Architecture

## System shape

A single-process Node.js MCP server, STDIO only. No database, no message queue, no external cache service — everything is in-memory, scoped to the life of one running process, started via `npx` (typical: one process per Claude Desktop/Claude Code session).

This matters for every decision below: we are not building a multi-tenant distributed service, and we should not import patterns that assume one. (This mirrors `gfw-mcp-server`'s framing — the difference here is we also don't have an auth token or a concurrency-limited upstream endpoint, so several of GFW's concerns don't apply at all; see Security model below.)

## Directory structure

```
src/
  index.ts               # STDIO entrypoint — imports and registers every tool
  tools/
    get-weather/            # one folder per MCP tool
      index.ts                # registration: server.registerTool(name, {...}, handler)
      schema.ts                # Zod input + output schema, and the plain types that mirror them
      handler.ts                 # the tool's own orchestration/summarization logic
      handler.test.ts              # unit tests (fixtures only, no network)
      handler.fixtures.ts            # shared test fixtures, if the tests need them
    get-fires/, get-fires-range/, ...  # one such folder per registered tool — see mcp-tools.md
  shared/
    fahsai-client/            # HTTP client for Fahsai's public REST API (fetch wrapper, error typing)
    place-resolver/            # Nominatim geocoding + place→bbox conversion, with in-process cache
    schema/                       # shared Zod fragments used by >1 tool (locationInput, isoDateSchema)
    fires/                          # domain logic genuinely shared by get_fires + get_fires_range
    nearest-station/                 # bbox/station_id → nearest station resolution (JOO-46) — see
                                       # "Reused logic" below for why this is shared/ despite one consumer
    aqi.ts, wind.ts, bbox.ts,          # small single-file cross-cutting utilities, each used by
    date-range.ts, latest-date.ts,      # multiple tools or shared modules
    station-readings.ts, tool-descriptions.ts,
    resolve-location.ts, tool-response.ts, result.ts,
    fetch-summarize.ts, summarize-valid-readings.ts, as-array.ts
```

Two-layer, colocated-per-tool structure (JOO-43): each tool owns its schema and handler in one folder; `shared/` holds only what's genuinely reused across tools. `shared/*` must never import from `tools/*`, and `tools/<a>/*` must never import from `tools/<b>/*` — if two tools need the same thing, promote it into `shared/` instead of reaching across. **This is convention, not lint-enforced.** It was previously CI-enforced end-to-end by ESLint's `import-x/no-restricted-paths`; that was dropped when the project migrated from ESLint/Prettier to Biome — Biome's `noRestrictedImports` matches literal import specifier text rather than resolved paths, so it can't reliably distinguish a sibling-tool import from a same-folder one for the short relative paths this codebase uses, and reproducing the old guarantee wasn't judged worth a hand-maintained per-folder config or a custom script for a small solo project (see `docs/claude/conventions.md`#module-boundaries). Watch for violations in review. The rule of thumb for where logic lives: if it's used by exactly one tool, it stays in that tool's own folder (even if it's meaty, like `get-station-baseline/handler.ts`); it only moves to `shared/` once a second tool needs it (like `shared/fires/`, used by both fire tools). See `mcp-tools.md` for the full checklist when adding or changing a tool.

Each tool's `handler.ts` should be readable top-to-bottom: validate input → resolve location (place→bbox via `shared/place-resolver/`, or pass through a given bbox, via `shared/resolve-location.ts`) → fetch (via `shared/fahsai-client/`) → summarize/classify (using `shared/aqi.ts`/`shared/wind.ts` or the tool's own logic) → return. Summarization and classification logic lives in small pure functions inside `handler.ts` (or a shared module, once reused), so it's unit-testable without mocking the MCP transport.

Each tool folder's schema.ts holds only the Zod-validated input/output contract; any other type used solely within that tool (e.g. a ToolDeps dependency-injection shape) lives next to the code that consumes it — typically handler.ts — and is imported by index.ts as needed.

## Data flow: a typical tool call

Using `get_fires` as the representative case:

```
MCP tool call
  → Zod schema validation (reject malformed input immediately, no network call made)
  → location resolution
      place given  → place-resolver: Nominatim lookup (cache hit or live call) → bbox
      bbox given   → pass through directly (bbox wins if both given, response notes place was ignored)
      neither      → default SEA bbox (89,1,114,30), matching Fahsai's own API default
  → fahsai-client: GET /api/fires?date=&bbox=
      success → summarize in code (total count, confidence breakdown, top-N by FRP if large)
      404     → "no data for this date" (expected/normal, not an error)
      5xx/network → typed error, no raw response body leaked
  → return structured response
```

`get_fires`'s summarization logic actually lives in `shared/fires/handler.ts`, not inside the `get-fires/` tool folder — it's shared with `get_fires_range` (see Directory structure above). Tools touching PM2.5 or wind values additionally pipe those fields through `shared/aqi.ts` / `shared/wind.ts` before returning — see `mcp-tools.md` for the checklist this implies for every tool.

## The place resolver (why it exists, and why Nominatim)

Every bbox-based tool accepts an optional `place` string so the LLM (and the person prompting it) can say "near Chiang Mai" instead of computing a bounding box by hand — mirroring the `find_region` pattern in `gfw-mcp-server`.

**Why Nominatim and not Mapbox**, even though Fahsai's own frontend already holds a Mapbox token: Mapbox's Product Terms default all Geocoding API requests to "temporary geocoding," which explicitly prohibits storing results for future use — session-only. That's incompatible with the caching this resolver needs (repeated "near Bangkok" queries within or across sessions shouldn't re-hit the geocoder every time), and pulling in permanent geocoding means a paid tier plus a second Mapbox token/quota decoupled from Fahsai's own account for no real benefit. Nominatim (OpenStreetMap) carries no such restriction, is free, and is already the fallback geocoder in this author's OpenAQ MCP design — one consistent geocoding approach across the whole MCP portfolio rather than a special case here.

The resolver:
1. Checks its in-process cache (place string → lat/lng), keyed on the normalized query string.
2. On miss, calls Nominatim with a proper identifying `User-Agent` header and self-throttles to Nominatim's documented ≤1 req/sec usage policy.
3. Converts the resolved point to a bbox using a fixed default radius of **±0.5° (~55km)**, overridable per-call via `radius_km`.
4. Clamps the result to Fahsai's data bbox (`89,1,114,30`). A place outside Southeast Asia resolves successfully as a *location* but returns an explicit "outside Fahsai's coverage area" note rather than a bbox that silently yields empty results from every downstream tool.
5. On multiple plausible matches, returns the top match plus a note that other matches existed — never silently guesses with no signal back to the caller.

## Reused logic (`shared/`)

**`shared/aqi.ts`** — classifies a raw PM2.5 µg/m³ value into the EPA category Fahsai's frontend already uses (Good/Moderate/Unhealthy for Sensitive Groups/Unhealthy/Very Unhealthy/Hazardous), step-function only (no need for the frontend's lerped-gradient variant, which exists purely for a smooth chart line). This is the project's "deterministic interpretation in code, not delegated to the LLM" principle applied to air quality specifically — every tool returning a PM2.5 number attaches its category.

**`shared/wind.ts`** — a direct port of Fahsai's `parseWindDir`: given a meteorological `directionDeg` (0°=N, always the direction wind is coming **FROM**), returns `{ fromLabel, toLabel }`. Never apply `+ 180` at a call site — this exact bug shipped twice on the Fahsai frontend (see its `conventions.md`) precisely because the correct logic wasn't centralized. It is here, and nowhere else in this repo should compute a compass label from `directionDeg` directly.

**`shared/fetch-summarize.ts`** — `fetchAndSummarize(client, path, params, options)` is the shared fetch → 404-handling → summarize → respond sequence used by every bbox/date-scoped tool (`get_fires`, `get_fires_range`, `get_weather`, `get_cams`). Each tool passes its own `extractData` (raw-shape guard against fahsai-client's unvalidated cast — reusing `shared/as-array.ts` where the raw shape is a plain array, or a tool-local guard for a one-off shape like CAMS's columnar grid) and `summarize` callbacks; the fetch/404/error branching itself lives in one place.

**`shared/summarize-valid-readings.ts`** — `summarizeValidReadings(raw, toSummary, noun?)` is the shared "filter out an invalid PM2.5 reading, count what was omitted, note it" loop used by both station-shaped-list tools (`get_station_readings`, `get_station_readings_history`); `noun` preserves each tool's own existing wording ("station reading(s)" vs "reading(s)").

**`shared/latest-date.ts`**'s `resolveDateOrLatest(client, date)` — resolves a given `date` as-is, or fetches `/api/latest-date` when omitted; a no-op once a date is already known. Used by `get_station_readings`, `get_reading_explanation`, and `shared/nearest-station`'s bbox-based resolution — all three need the same "endpoint 404s on an omitted date instead of defaulting to a rolling window" fallback (see `fetchLatestDate` above).

**`shared/nearest-station/`** — `findNearestStation(client, input)` resolves either a `station_id` (exact match via `/api/stations/:id`, no distance logic) or a `bbox` (fetches `/api/station-readings/latest`, picks the closest station to the bbox center by haversine distance, rejecting anything beyond a 50km cutoff — distinct from the place resolver's 55km *search* radius above). It's a deliberate exception to this project's usual rule of thumb (Directory structure, above): it was built directly in `shared/` by JOO-46 as forward-looking groundwork for the multi-ticket Reading Explanation feature, *before* `get_reading_explanation` (JOO-47) existed to consume it — not because a second tool needed `findNearestStation` itself. As of this writing it still has exactly one consumer, `get_reading_explanation`; `get_station_readings` calls `/api/station-readings/latest` directly and has its own separate bbox-scoped list-all logic, it does not call `findNearestStation`. Contrast this with the *raw* `/api/station-readings/latest` response types (`shared/station-readings.ts`) and `fetchLatestDate()` (`shared/latest-date.ts`), which were promoted to `shared/` by the genuine 2-consumer rule — `get_station_readings` and `nearest-station` both need the raw types, `get_latest_date` and `nearest-station` both need `fetchLatestDate()`.

## Transports

STDIO only. Unlike `gfw-mcp-server`, there is no Streamable HTTP transport planned for this project — no demand identified, and this server has no auth boundary of its own that would make a remote deployment meaningfully different from "the same npx tool, just always running." Revisit only on a concrete signal (directory listing request, one-click-install ask).

## Security model

This server's security posture is meaningfully **simpler** than `gfw-mcp-server`'s, because the upstream API it wraps has no auth at all:

- **There is no token, no bearer credential, and no per-account scope.** Fahsai's REST API is fully public — anyone can already call every route this server wraps directly, with or without this server in the middle. There's nothing additional to protect.
- **Zod schema validation is the input sanitization layer**, same as GFW's approach — no separate validation framework needed.
- **The only rate-sensitive resource this server touches is Nominatim**, which is protected by the resolver's own self-throttling (see above), not by anything auth-related.
- **STDIO is a local trusted pipe** — client and server run as the same user's processes. No network isolation concerns apply, since there is no HTTP transport in this project.

Don't add auth middleware, rate-limiting beyond Nominatim's documented policy, or output sanitization beyond "don't leak raw upstream error bodies" (handled in `fahsai-client`) without a specific reason tied to an actual threat.

## MCP best practices: what we adopt, adapt, or skip

| Best-practices guide section                                           | Status here                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single Responsibility (one server, one purpose)                        | **Adopt as-is.** This server does Fahsai data and nothing else.                                                                                                                                         |
| Defense in depth (network/auth/authz/validation/monitoring layers)     | **Adapted, further than GFW** — collapses to "Zod validation" only. There's no auth layer to add depth to, since the upstream API has none.                                                             |
| Fail-safe design / graceful degradation                                | **Adopt, scaled down** — 404-vs-5xx distinction in `fahsai-client`, and the place resolver's "outside coverage area" vs "not found" distinction, are this project's version of this.                    |
| Structured error handling / error classification                       | **Adopt.** `fahsai-client` produces a small closed set of typed errors (network / 4xx / 5xx / no-data-for-date), never leaking raw response bodies.                                                     |
| Configuration management (env-specific overlays)                       | **Skip the overlay system** — a handful of optional tuning env vars, no config framework needed.                                                                                                        |
| Performance (connection pooling, multi-level cache, async task queues) | **Adapted, lighter than GFW** — no report queue (nothing here shares a concurrency-limited upstream endpoint the way GFW's 4Wings report API does); the place-resolver cache is the only caching layer. |
| Monitoring/observability                                               | **Skip** — no operator dashboard for an npx-run local tool.                                                                                                                                             |
| Health checks / service discovery / Kubernetes                         | **Skip entirely** — not a deployment shape this project has.                                                                                                                                            |
| Multi-layer testing (unit / integration / contract / load)             | **Adopt, scaled down** — unit tests (fixtures) + a live smoke suite (`test:live`) + manual MCP protocol conformance in Claude Desktop. No load testing.                                                 |
| Chaos engineering                                                      | **Skip** — no distributed failure modes exist to simulate.                                                                                                                                              |