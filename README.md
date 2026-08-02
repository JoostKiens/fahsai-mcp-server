# fahsai-mcp-server

An [MCP](https://modelcontextprotocol.io) server exposing [Fahsai](https://fahsai.fyi)'s public data — active fire detections, PM2.5 air quality, weather/wind, and power plants across mainland Southeast Asia and surrounding areas — as LLM-friendly tools.

See [`CLAUDE.md`](CLAUDE.md) and [`docs/claude/`](docs/claude/) for architecture and conventions.

## Usage with Claude Desktop

Add an entry to your `claude_desktop_config.json`'s `mcpServers`:

```json
{
  "mcpServers": {
    "fahsai": {
      "command": "fahsai-mcp-server"
    }
  }
}
```

This requires the package to be resolvable on your `PATH` — either `npm link` (before it's published to npm) or a global/npx install once published.

Alternatively, point directly at a local build without linking:

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

Restart Claude Desktop after editing the config. All 13 tools (fires, PM2.5 stations, CAMS model estimates, weather, power plants, geocoding) should appear in its tool list.
