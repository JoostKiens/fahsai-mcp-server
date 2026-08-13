# fahsai-mcp-server

An [MCP](https://modelcontextprotocol.io) server exposing [Fahsai](https://fahsai.fyi)'s public data — active fire detections, PM2.5 air quality, weather/wind, and power plants across mainland Southeast Asia and surrounding areas — as LLM-friendly tools.

See [`CLAUDE.md`](CLAUDE.md) and [`docs/claude/`](docs/claude/) for architecture and conventions.

## Usage with Claude Desktop

Once published, install and run via `npx` — no separate install step needed. Add an entry to your `claude_desktop_config.json`'s `mcpServers`:

```json
{
  "mcpServers": {
    "fahsai": {
      "command": "npx",
      "args": ["-y", "fahsai-mcp-server"]
    }
  }
}
```

> **Not yet published to npm.** Until then, use one of the options below instead.

### Before publishing (works today)

Either `npm link` the package so it resolves on your `PATH`:

```json
{
  "mcpServers": {
    "fahsai": {
      "command": "fahsai-mcp-server"
    }
  }
}
```

or point directly at a local build without linking:

```json
{
  "mcpServers": {
    "fahsai": {
      "command": "node",
      "args": ["/absolute/path/to/fahsai-mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop after editing the config. All 14 tools (fires, PM2.5 stations, CAMS model estimates, weather, power plants, geocoding, reading explanations) should appear in its tool list.

## Example prompts

Fahsai ingests data on a daily schedule and has no live "today" — "yesterday" is typically the most recent complete date (new data usually lands by 06:30 Bangkok time). Ask for a specific past date (e.g. "yesterday") rather than "today"; the server also exposes `get_latest_date` to look up the most recent complete date directly, since a "latest"-style query with no date attached can otherwise come back empty.

- **Fires:** "Are there any active fires near the Myanmar–Thailand border in the last week?"
- **PM2.5:** "What was the PM2.5 level in Chiang Mai yesterday?"
- **Weather:** "What was the wind direction and speed over Bangkok yesterday?"
- **Power plants:** "How many coal power plants are within 50 km of Mae Moh?"
- **Place-name resolution:** "Where exactly is the Golden Triangle in Thailand, and which countries meet there?"
- **Reading explanation:** "Why is the PM2.5 reading near Chiang Rai so high today?"

## Architecture

`fahsai-mcp-server` is a **read-only client** of [Fahsai](https://fahsai.fyi)'s public REST API — it has no direct database access and shares no code with the Fahsai backend, only its public HTTP endpoints, the same ones the map frontend uses. All fire, air quality, weather, and power plant data originates from Fahsai's own ingestion pipeline; this server's job is limited to summarizing, classifying (AQI/wind), and resolving place names into the bounding boxes Fahsai's API expects, so the data is easier for an LLM to consume. See the [`fahsai`](https://github.com/JoostKiens/fahsai) repo for what the underlying data represents and how it's collected.

## Attribution

| Source                                                           | What                                        | Cadence | License        |
| ------------------------------------------------------------------ | ------------------------------------------ | ------- | -------------- |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) (VIIRS/SNPP) | Fire detections — location, FRP, confidence | Daily   | NASA open data |
| [OpenAQ](https://openaq.org/) v3                                 | PM2.5 ground stations                       | Daily   | CC BY 4.0      |
| [Open-Meteo](https://open-meteo.com/)                            | Wind grid + CAMS PM2.5 atmospheric model    | Daily   | CC BY 4.0      |
| [WRI Global Power Plant Database](https://resourcewatch.org/)    | Coal, gas, oil, diesel power plants         | Static  | CC BY 4.0      |
