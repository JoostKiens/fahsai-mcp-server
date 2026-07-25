# Conventions

This project shares an author with `fahsai` and `gfw-mcp-server` — code style follows the same conventions as both, adapted to a small single-package repo (no pnpm workspace needed here; one `package.json` at root).

## Code style

- Prettier for formatting, ESLint for code quality — same config shape as `fahsai`: single quotes, semicolons, trailing commas, 100 char print width.
- ESLint flat config (`eslint.config.js`), `@typescript-eslint` recommended-type-checked.
- Never use loose equality (`==`/`!=`). Always strict (`===`/`!==`). For null/undefined checks, use explicit `=== null || === undefined` or TypeScript narrowing.
- Run `npm run format` (or your editor's format-on-save) before committing.

## Error handling

Follow `gfw-mcp-server`'s `Result`-over-exceptions pattern for anything the Fahsai API, Nominatim, or Zod validation can produce. Reserve thrown exceptions for genuine programmer errors (a missing required env var at startup, an unreachable code path) — not for expected failure modes like "no data for this date" or "place not found," which are `Result` values a tool handler branches on deliberately.

## Module boundaries

Tool files (`src/tools/*.ts`) stay thin: schema + orchestration only. Any logic reused by two or more tools moves to `src/logic/`, `src/place-resolver/`, or `src/fahsai-client/` as appropriate — see `mcp-tools.md`'s "where does this belong" section. A tool file that's grown a large private helper function is a signal that helper probably wants to live in `logic/` even if only one tool currently uses it, if the logic is domain knowledge (AQI, wind, fire summarization) rather than this-tool-specific glue.

## Naming

- Tool names: `snake_case`, verb-first (`get_fires`, `geocode_place`) — matches both `fahsai`'s route naming and `gfw-mcp-server`'s tool naming.
- Shared schema fragments: `camelCase` exports from `src/schemas/` (e.g. `locationInput`).

## Testing

Vitest, matching `gfw-mcp-server`. Fixture data for unit tests lives alongside the tool/module it exercises (`*.fixture.ts` or a co-located `__fixtures__/` — pick one and stay consistent once the first tool sets the pattern). `npm run test` must never require network access; `npm run test:live` is the explicit opt-in exception, see `CLAUDE.md`.

## Git / commits

No commitlint/husky setup is mandated for this repo the way `fahsai`'s monorepo has — this is a small single-package tool. If conventional commits end up useful, adopt them ad hoc; don't add tooling for it preemptively.