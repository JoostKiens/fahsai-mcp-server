# Writing an MCP tool in this repo

This is the concrete pattern for adding or modifying a tool in `src/tools/<tool-name>/`. Read `architecture.md` and `conventions.md` first — this doc assumes both.

## The shape of a tool folder

Every tool is a folder under `src/tools/<tool-name>/` with three files:

```typescript
// schema.ts — Zod input schema (composes the shared locationInput fragment from
// shared/schema/ where relevant, plus only the fields this specific tool needs) and Zod
// output schema, plus the plain TS types that mirror them. Pure schema/types only — zero
// fetch or business logic.
export const getFiresInputSchema = z.object({ /* ... */ });
export const fireSummaryOutputSchema = z.object({ /* ... */ }); // or imported from shared/,
                                                                   // if shared with a sibling tool

// handler.ts — everything else: raw-API types, pure summarization/classification functions
// (unit-tested directly with fixture data, no MCP or network involved), and the handler
// factory itself — the only part that touches the network or MCP protocol types.
function summarizeFires(raw: readonly FirePoint[]): FireSummary { /* ... */ }
export function createGetFiresHandler(deps: FiresToolDeps) {
  return async (input: GetFiresInput): Promise<FireToolResult> => { /* ... */ };
}

// index.ts — tool registration only: name, description, schema, handler. Imports schema.ts
// and handler.ts and wires them into server.registerTool(...).
export function registerGetFires(server: McpServer, deps: FiresToolDeps): void { /* ... */ }
```

If a tool's schema or handler logic is genuinely shared with a sibling tool (e.g. `get_fires` and `get_fires_range` both need `fireSummaryOutputSchema` and `fetchAndSummarizeFires`), that logic moves to `shared/<name>/schema.ts` + `shared/<name>/handler.ts` instead — see `architecture.md`'s directory structure and import-boundary rules. `tools/<a>/*` must never import from `tools/<b>/*` (ESLint enforces this); promote to `shared/` instead.

The handler should read as a straight-line sequence: validate → resolve location → fetch → classify/summarize → return. If it doesn't read that way, the logic making it complicated probably belongs in a separate pure function.

## Checklist for a new or changed tool

Before considering a tool done:

- [ ] **Input schema composes the shared `locationInput` fragment** (`shared/schema/location.ts`) if the tool takes a location at all — never hand-roll `place`/`bbox`/`radius_km` fields per-tool. **`geocode_place` is the one exception**: it resolves a place, it doesn't go on to call the Fahsai API with a `bbox`, so a `bbox` input field would be meaningless — it composes only the `place`/`radius_km` shape instead, reusing `shared/schema/location.ts`'s exported `bboxSchema`/`shared/bbox.ts`'s `BoundingBox` for its *output* bbox rather than defining its own.
- [ ] **Every PM2.5 value returned goes through `shared/aqi.ts`.** No bare `pm25` numbers without an accompanying `aqiCategory`.
- [ ] **Every wind direction returned goes through `shared/wind.ts`.** No raw `directionDeg` surfaced without `fromLabel`/`toLabel`.
- [ ] **Output fields that are conditionally null/absent are documented inline** with a comment explaining the condition — e.g. `get_reading_explanation`'s `transport: null` for `OUTLIER_HIGH`/`OUTLIER_LOW` `explainCase`s, or `stationBaseline: null` when the reading is unremarkable for the season (`src/tools/get-reading-explanation/schema.ts`). A null here is meaningful signal, not missing data — don't leave the LLM to guess why a field is absent.
- [ ] **No raw large arrays pass through unmodified.** Fire lists, CAMS grids, 365-row baseline curves: summarize (counts, breakdowns, top-N, mean/median/p95) in a pure function first. Full raw data only behind an explicit opt-in param, with a hard cap. If you're tempted to `return fahsaiResponse.entries` unmodified because "the LLM can figure it out," stop — that's exactly the case this rule exists for. **Station-shaped lists are the one exception** (`get_station_readings`, and by extension `get_stations`/`get_station_readings_history`): bounded by the physical sensor network size, not by event volume, so they're returned in full, unsummarized. Where an entry carries a PM2.5 value (`get_station_readings`, `get_station_readings_history`) it's still enriched with `aqiCategory` — `get_stations` itself has no PM2.5 value to classify, it's just the station directory (`id`/`name`/`lat`/`lng`/`country`/`provider`).
- [ ] **Date ranges validate against the *real* API's caps before any network call** (`get_fires_range`: 10 days, `get_cams_summary`: 139 days — verified live 2026-07-27, JOO-35) — reject client-side with an actionable message, never let the API's own 400 leak through raw.
- [ ] **404 vs 5xx are distinguished**, for any endpoint where "no data yet" is an expected, common state (most date-scoped Fahsai endpoints — ingestion runs on a schedule, so "today" may not have landed). A 404 becomes an explicit "not available yet" response, not a generic error.
- [ ] **Tools requiring a `station_id`** (`get_station_readings_history`, `get_station_history`, `get_station_baseline`) say so explicitly in their description, and point to `get_stations` as the way to obtain one — a place name is not a valid input for these.
- [ ] **Errors are `Result`, not exceptions**, for anything the Fahsai API, Nominatim, or validation can produce. The tool handler converts the final `Result` to the MCP response/error shape at the boundary.
- [ ] **Location resolution reuses `shared/resolve-location.ts` / `shared/place-resolver/`**, never reimplemented per-tool.
- [ ] **Unit test with fixture data** covers: the happy path, at least one boundary condition specific to this tool (a range cap, a 404/no-data case, an empty-results case), and — where the tool summarizes — the summarization math against known fixture input/output.
- [ ] **Tool description (the string the LLM sees) is specific about scope** — e.g. `get_cams`'s description should note it's a *model estimate*, not a ground-truth measurement, since conflating it with `get_station_readings` is a plausible LLM mistake. `get_reading_explanation`'s description is a second example: it spells out which fields are conditionally null and why, and that `station_id` takes precedence over `place`/`bbox` when both are given, rather than leaving the LLM to infer either from the schema alone.

## The `place` vs `bbox` mutual-exclusivity rule

If both `place` and `bbox` are given to a tool, `bbox` wins and the response includes a note that `place` was ignored — never silently drop one input with no signal back to the caller. If neither is given, tools fall back to Fahsai's own default SEA bbox (`89,1,114,30`).

## When you're not sure whether something belongs in a tool's own folder or in `shared/`

- **Tool folder** (`tools/<name>/schema.ts` + `handler.ts`): orchestration and this-tool-specific summarization/formatting — the default, even for a large private helper, as long as exactly one tool uses it.
- **`shared/fahsai-client/`**: anything about *how* to talk to the Fahsai API (fetch wrapper, error typing) — no domain knowledge about fires, AQI, or wind.
- **`shared/place-resolver/`** + **`shared/resolve-location.ts`**: Nominatim lookup, caching, throttling, and the place→bbox conversion — no tool-specific logic.
- **`shared/aqi.ts`, `shared/wind.ts`, `shared/bbox.ts`, `shared/tool-response.ts`, `shared/result.ts`**: small, single-file, pure cross-cutting utilities, each reused by multiple tools or shared modules.
- **`shared/schema/`**: only truly cross-tool Zod primitives (`locationInput`, `isoDateSchema`) — never a per-tool schema.

If logic would be useful to two or more tools, it doesn't live in either tool's folder — it moves to `shared/` (a flat file for a small utility, or its own `shared/<name>/schema.ts` + `handler.ts` folder for a meatier shared domain module, mirroring a tool folder's shape — see `shared/fires/` for the pattern), imported by both. ESLint's `import-x/no-restricted-paths` enforces this — a `tools/<a>/*` import from `tools/<b>/*` fails lint, so this isn't just a convention to remember.