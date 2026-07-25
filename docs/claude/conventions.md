# Conventions

This project shares an author with `fahsai` and `gfw-mcp-server` — code style follows the same conventions as both, adapted to a small single-package repo (no pnpm workspace needed here; one `package.json` at root).

Concrete rules, not vague principles. If you're about to write code that contradicts something here, either follow this doc or update it — don't silently diverge.

## Functional style

- **Default to pure functions.** Given the same input, always return the same output, no side effects. This applies to all validation, summarization, region/gear-name resolution, and caveat-generation logic.
- **Classes are allowed only for stateful infrastructure** — things that genuinely have a lifecycle and internal mutable state:
  - `Cache<K, V>` (the TTL cache)
  - `ReportQueue` (the 4Wings concurrency lock + 524 recovery)
  - The GFW HTTP client, if it holds connection-level state (otherwise prefer a factory function returning a plain object of functions)
  - Everything else — tool handlers, summarization, validation, formatting — is functions and plain data, not classes.
- **Immutability by default.** All `interface`/`type` fields are `readonly` unless there's a specific reason for mutation (there rarely is outside the `Cache`/`ReportQueue` internals). Use `as const` for literal unions and fixed config objects. Enforce this with a strict `tsconfig.json` (`readonly` arrays via `ReadonlyArray<T>`/`readonly T[]`) — don't rely on convention alone; if `eslint-plugin-functional` is added, prefer its `no-mutation` and `prefer-readonly-type` rules over immutability by discipline.

## Error handling: `Result<T, E>` for expected failures

Business-logic failures — validation errors, GFW API errors, "region not found," cache misses treated as a normal path — are **expected outcomes**, not exceptional ones. Model them as return values, not thrown exceptions:

```typescript
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

Use this for:
- Zod validation results (wrap `.safeParse`, don't `.parse` and catch)
- GFW client responses (`Result<GfwResponse, GfwError>`, where `GfwError` is the small closed set from `architecture.md`)
- Region/gear-name resolution (`Result<RegionId, RegionNotFoundError>`)

Reserve `throw`/exceptions for genuinely unexpected, programmer-error conditions — a missing env var at startup, an invariant violation that indicates a bug, not a user- or API-driven failure. If you find yourself writing `try/catch` around a GFW call, that's a sign the call should return a `Result` instead.

Tool handlers convert a final `Result` into the MCP response/error shape at the boundary — that conversion is the one place `Result` and MCP's own error conventions meet.

## SOLID, translated for functional TypeScript

SOLID was written for class-based OOP. Applied here:

| Principle                 | What it means in this codebase                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Single Responsibility** | One function does one thing. A tool handler orchestrates (validate → resolve → fetch → summarize → respond); it does not itself contain summarization math — that's a separate, separately-testable function. One module = one concern (e.g. `gfw-client` only knows HTTP + auth + error typing; it has no idea what a "fishing effort summary" is).                                                |
| **Open/Closed**           | Extend behavior by adding data or new functions, not by editing existing ones. A new gear type is a new entry in `reference-data/gear-types.ts`, not a new `if` branch scattered through tool logic. A new tool is a new file in `tools/`, not a new parameter on an existing tool that changes its behavior.                                                                                       |
| **Liskov Substitution**   | Applies loosely to our `Result`/interface shapes: anything implementing a given `Result<T, E>` shape or a given tool-input type must be usable anywhere that shape is expected, with no surprising special cases. If a function claims to return `Result<Summary, GfwError>`, every caller should be able to treat any success value identically — no hidden variants that need different handling. |
| **Interface Segregation** | Each tool's Zod input schema includes only what *that tool* needs. Don't create one shared "mega-schema" with optional fields for every tool's parameters — `get_vessel_events`'s schema has no business knowing about `matched` (a SAR-detection-only filter).                                                                                                                                     |
| **Dependency Inversion**  | Tool logic depends on the `gfw-client` and `cache`/`queue` *interfaces* (function signatures / injected dependencies), not on concrete implementations reaching out to global singletons. This is what makes unit testing with mocked GFW responses (see `mcp-tools.md`) possible without a mocking framework that reaches into module internals.                                                   |

## Naming and size

- Function and variable names describe *what*, not *how* (`summarizeFishingEffort`, not `processData`).
- Keep functions small enough to read without scrolling — if a function has more than one clear "phase" (e.g. both "parse the GFW response" and "compute totals"), split it.
- No magic numbers/strings in tool logic — the `366`-day limit, dataset IDs like `public-global-fishing-effort:latest`, and similar constants live in named exports (`reference-data/` or a `constants.ts`), not inlined in tool files.
- Avoid deep nesting — prefer early returns (`Result`'s error branch checked first) over pyramided `if`/`else`.

## Zod schemas

- One schema per tool, colocated with that tool's file.
- Validate at the boundary only — once a tool's handler has a validated, typed input, internal logic works with plain TypeScript types, not `z.infer<>` sprinkled everywhere downstream.
- Enum fields (gear type, vessel type) validate against the bundled `reference-data/` constants — never hardcode a duplicate list of valid values in a schema.

## Testing conventions (summary — see `mcp-tools.md` and the Testing milestone in Linear for detail)

- Unit tests use fixture GFW responses, not live calls, and target the pure summarization/validation functions directly — not the MCP tool-call wrapper.
- A tool handler itself should be thin enough that testing it is close to an integration test (wiring), while the interesting logic (already pure functions) is tested in isolation.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <description>`.

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`

**Scopes** (one per commit; matches `src/` layout and project milestones — pick the closest, don't invent new ones without adding them here first):

| Scope            | Covers                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `scaffolding`    | Project skeleton, transports (STDIO/HTTP), build/tooling config, env setup                                       |
| `gfw-client`     | GFW API HTTP client, auth, error typing, rate-limit handling                                                     |
| `cache`          | `Cache<K,V>`, the 4Wings report queue and 524 recovery                                                           |
| `reference-data` | Gear types, vessel types                                                                                         |
| `tools`          | Any MCP tool logic (`src/tools/*`) — use a sub-scope like `tools/find-vessels` if a commit touches only one tool |
| `docs`           | README, CLAUDE.md, `docs/claude/*`                                                                               |
| `tests`          | Unit tests, fixtures, live smoke tests, MCP conformance tests                                                    |
| `release`        | Versioning, npm publish, CI/CD, GitHub repo setup                                                                |

Examples:
```
feat(tools/find-region): add EEZ name fuzzy matching
fix(cache): normalize date-range param ordering in report cache key
docs(scaffolding): document GFW_API_TOKEN setup in CLAUDE.md
chore(release): bump to v0.1.0
```

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

## Pull requests

**Title** follows the same `<type>(<scope>): <description>` shape as commit messages, with the Linear ticket id inserted right after the colon when one exists:

```
feat(scaffolding): JOO7 - build-time gear/vessel-type reference data
```

Omit the ticket segment entirely when there isn't one — just `<type>(<scope>): <description>`.

**Description** opens with a `## Context` section, before `## Summary` and `## Test plan`:

- **A Linear ticket exists for the work:** link it directly.
  ```
  ## Context
  https://linear.app/joostkiens/issue/JOO-7/scaffold-build-time-reference-data-gear-types-vessel-types
  ```
- **No ticket** (a small fix, a doc cleanup, something opportunistic): a short blurb — one or two sentences on why the change is happening — instead of a link.
  ```
  ## Context
  Fixes a stale doc reference to the EEZ table found while reviewing JOO-7's docs; no separate ticket for this.
