# CLAUDE.md

This file is the entrypoint for Claude Code working in this repository. Read it first. It points to deeper docs — read those too before touching the areas they cover.

## What this project is

An open-source, npm-published MCP server exposing [Fahsai](https://fahsai.fyi)'s public data — active fire detections, PM2.5 air quality (ground stations and the CAMS atmospheric model), weather/wind, and power plants across Thailand, Myanmar, Laos, and Cambodia — as LLM-friendly tools. This server is a client of the [`fahsai`](https://github.com/JoostKiens/fahsai) repo's public REST API; it doesn't share code or a database with it. TypeScript, `@modelcontextprotocol/sdk`, Zod validation, **STDIO transport only**.

This is a **practice / portfolio project** — hands-on MCP experience, a GitHub artifact, a LinkedIn talking point. It is explicitly *not* a Fahsai product roadmap item, so scope stays tight; don't gold-plate.

Full ticket-level scope lives in Linear (project: *fahsai-mcp-server*). This file and `docs/claude/` cover **how to build it**, not **what to build** — check Linear before starting new work.

## Before you write code

Read the doc that matches what you're touching:

| Working on...                                                                     | Read                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Directory layout, data flow, the place resolver, transports, security model       | [`docs/claude/architecture.md`](docs/claude/architecture.md)       |
| Code style — formatting, error handling, module boundaries                        | [`docs/claude/conventions.md`](docs/claude/conventions.md)         |
| Adding or changing an MCP tool specifically                                       | [`docs/claude/mcp-tools.md`](docs/claude/mcp-tools.md)             |
| The exact shape of a specific Fahsai API route — params, response fields, gotchas | [`docs/claude/fahsai-api-reference.md`](docs/claude/fahsai-api-reference.md) |

We follow the [MCP best practices guide](https://modelcontextprotocol.info/docs/best-practices/), **adapted for a single-process, single-user local/npx tool**, same posture as this author's other MCP server (`gfw-mcp-server`). `architecture.md` has an explicit adopt/adapt/skip table — don't add production-service patterns "for best practice" without checking that table first.

`fahsai-api-reference.md` is a copy-paste of `fahsai`'s own `docs/claude/architecture.md`, reformatted for internal reference — **treat it as a starting point, not ground truth.** Before shipping a param name or response-shape assumption pulled from this file, verify it against the live API (`npm run test:live` once tools exist, or a throwaway script — see `fahsai-api-reference.md` for the current base URL, since `fahsai.fyi` is the frontend domain and does not proxy the API). If you find the doc wrong, fix it in place with a note on what was verified and when — the next person to read it needs the correction too.

## Non-negotiable constraints

These aren't style preferences — violating them either breaks against the real API or undoes a deliberate design decision made during scoping:

- **`geocode_place` and every location-resolving tool use Nominatim (OpenStreetMap), never Mapbox.** Mapbox's default "temporary geocoding" terms prohibit storing results for future use, which conflicts directly with caching. This was a deliberate research finding, not an oversight — don't "simplify" this back to Mapbox because Fahsai's frontend already has a token. See `architecture.md`.
- **Every tool response that includes a PM2.5 value carries an AQI category** (via the shared `aqi.ts`, EPA breakpoints matching Fahsai's own `aqiColors.ts`) — never a bare number with the classification left to the LLM.
- **Every tool response that includes wind data goes through the shared `wind.ts` formatter** (`fromLabel`/`toLabel`/`fromQuadrant`/`toQuadrant`). Never format `directionDeg` inline, and never apply `+ 180` to it — that exact bug shipped twice on the Fahsai frontend (see `fahsai`'s `docs/claude/conventions.md`). `directionDeg` is always the direction wind is coming **FROM**.
- **`POST /api/explain`, `GET /health`, and urban/industrial center data are explicit non-goals**, not omissions. `/api/explain` shares Fahsai's public 500-request/day Gemini quota with real map users, is SSE-streamed, and re-wraps one LLM's synthesis inside another LLM's tool call — a bad shape for this project. `/health` has no LLM-facing value. Urban/industrial centers (`urbanSources.ts`) are static data used only inside `/api/explain`'s prompt context — there's no public route to wrap, and it's hand-maintained data with no staleness signal, so it's not a good bundling candidate either. Don't add tools for any of these without revisiting the decision explicitly.
- **No raw large arrays pass through unmodified.** Fire lists, CAMS grids (up to 4,599 points), and 365-row baseline curves are summarized in code before returning — see `mcp-tools.md`.
- **Date-range caps are enforced client-side, matching the underlying API's own limits** (`get_fires_range`: 10 days, `get_cams_summary`: 130 days) — reject before calling, never let the API's raw error leak through.

## Commands

```bash
npm run build       # compile TypeScript
npm run dev          # run with watch mode
npm run start         # run compiled server (STDIO)
npm run lint          # eslint
npm run test           # unit tests (fixtures only, no network)
npm run test:live       # live API smoke tests against the Fahsai backend (no auth required)
```

## Environment

No API keys required — Fahsai's REST API and Nominatim are both public/unauthenticated. See `.env.example` for the (entirely optional) tuning values: place-resolver cache TTL, default geocoding radius. The Fahsai API's base URL (`https://api-server-service-production.up.railway.app` — Fahsai's backend is deployed on Railway; `fahsai.fyi` is the frontend domain and does not proxy the API) is a fixed constant in `src/shared/fahsai-client/client.ts`, not an env var — it's an implementation detail, not a per-install preference.