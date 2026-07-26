# Writing an MCP tool in this repo

This is the concrete pattern for adding or modifying a tool in `src/tools/`. Read `architecture.md` and `conventions.md` first — this doc assumes both.

## The shape of a tool file

Every tool file follows the same skeleton:

```typescript
// 1. Zod input schema — composes the shared locationInput fragment (schemas/) where relevant,
//    plus only the fields this specific tool needs.
const inputSchema = z.object({ /* ... */ });

// 2. Pure logic functions — summarization, classification, formatting.
//    Unit-tested directly with fixture data, no MCP or network involved.
function summarizeFires(raw: FahsaiFiresResponse): FireSummary { /* ... */ }

// 3. The tool handler — thin orchestration, wired to fahsai-client/place-resolver/logic.
//    This is the only part that touches the network or MCP protocol types.
async function handleGetFires(input: FiresInput): Promise<Result<FireSummary, ToolError>> { /* ... */ }

// 4. Tool registration — name, description, schema, handler.
```

The handler should read as a straight-line sequence: validate → resolve location → fetch → classify/summarize → return. If it doesn't read that way, the logic making it complicated probably belongs in a separate pure function.

## Checklist for a new or changed tool

Before considering a tool done:

- [ ] **Input schema composes the shared `locationInput` fragment** (`schemas/location.ts`) if the tool takes a location at all — never hand-roll `place`/`bbox`/`radius_km` fields per-tool. **`geocode_place` is the one exception**: it resolves a place, it doesn't go on to call the Fahsai API with a `bbox`, so a `bbox` input field would be meaningless — it composes only the `place`/`radius_km` shape instead, reusing `schemas/location.ts`'s exported `bboxSchema`/`BoundingBox` for its *output* bbox rather than defining its own.
- [ ] **Every PM2.5 value returned goes through `logic/aqi.ts`.** No bare `pm25` numbers without an accompanying `aqiCategory`.
- [ ] **Every wind direction returned goes through `logic/wind.ts`.** No raw `directionDeg` surfaced without `fromLabel`/`toLabel`.
- [ ] **No raw large arrays pass through unmodified.** Fire lists, CAMS grids, 365-row baseline curves: summarize (counts, breakdowns, top-N, mean/median/p95) in a pure function first. Full raw data only behind an explicit opt-in param, with a hard cap. If you're tempted to `return fahsaiResponse.entries` unmodified because "the LLM can figure it out," stop — that's exactly the case this rule exists for. **Station-shaped lists are the one exception** (`get_station_readings`, and by extension `get_stations`/`get_station_readings_history`): bounded by the physical sensor network size, not by event volume, so they're returned in full, unsummarized. Where an entry carries a PM2.5 value (`get_station_readings`, `get_station_readings_history`) it's still enriched with `aqiCategory` — `get_stations` itself has no PM2.5 value to classify, it's just the station directory (`id`/`name`/`lat`/`lng`/`country`/`provider`).
- [ ] **Date ranges validate against the *real* API's caps before any network call** (`get_fires_range`: 10 days, `get_cams_summary`: 130 days) — reject client-side with an actionable message, never let the API's own 400 leak through raw.
- [ ] **404 vs 5xx are distinguished**, for any endpoint where "no data yet" is an expected, common state (most date-scoped Fahsai endpoints — ingestion runs on a schedule, so "today" may not have landed). A 404 becomes an explicit "not available yet" response, not a generic error.
- [ ] **Tools requiring a `station_id`** (`get_station_readings_history`, `get_station_history`, `get_station_baseline`) say so explicitly in their description, and point to `get_stations` as the way to obtain one — a place name is not a valid input for these.
- [ ] **Errors are `Result`, not exceptions**, for anything the Fahsai API, Nominatim, or validation can produce. The tool handler converts the final `Result` to the MCP response/error shape at the boundary.
- [ ] **Location resolution reuses the shared `place-resolver`**, never reimplemented per-tool.
- [ ] **Unit test with fixture data** covers: the happy path, at least one boundary condition specific to this tool (a range cap, a 404/no-data case, an empty-results case), and — where the tool summarizes — the summarization math against known fixture input/output.
- [ ] **Tool description (the string the LLM sees) is specific about scope** — e.g. `get_cams`'s description should note it's a *model estimate*, not a ground-truth measurement, since conflating it with `get_station_readings` is a plausible LLM mistake.

## The `place` vs `bbox` mutual-exclusivity rule

If both `place` and `bbox` are given to a tool, `bbox` wins and the response includes a note that `place` was ignored — never silently drop one input with no signal back to the caller. If neither is given, tools fall back to Fahsai's own default SEA bbox (`89,1,114,30`).

## When you're not sure whether something belongs in a tool file or in `logic/`/`place-resolver`/`fahsai-client`

- **Tool file**: orchestration and this-tool-specific summarization/formatting.
- **`fahsai-client`**: anything about *how* to talk to the Fahsai API (fetch wrapper, error typing) — no domain knowledge about fires, AQI, or wind.
- **`place-resolver`**: Nominatim lookup, caching, throttling, and the place→bbox conversion — no tool-specific logic.
- **`logic/`**: `aqi.ts` and `wind.ts` — small, pure, reused by any tool that touches PM2.5 or wind data.

If logic would be useful to two or more tools, it doesn't live in either tool's file — it moves to `logic/` (or a new shared module alongside it), imported by both.