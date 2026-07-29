import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CALL_GET_LATEST_DATE_FIRST_NOTE } from '../../shared/tool-descriptions.js';
import { createGetWeatherHandler, type WeatherToolDeps } from './handler.js';
import { getWeatherInputSchema, weatherOutputSchema } from './schema.js';

export function registerGetWeather(server: McpServer, deps: WeatherToolDeps): void {
  server.registerTool(
    'get_weather',
    {
      title: 'Get weather',
      description:
        'Gridded weather (wind, relative humidity, precipitation) for a single date, filtered by place name ' +
        'or bounding box. Wind direction is always the direction wind is coming FROM — see the `wind` field\'s ' +
        '`fromLabel`/`toLabel`. The underlying grid can span thousands of points, so by default this returns ' +
        'a coarse regional summary (a bbox-wide `summary` plus per-region `cells`), not every raw point — set ' +
        `\`include_raw_points\` to get individual grid points instead (capped, with a note if truncated). ${CALL_GET_LATEST_DATE_FIRST_NOTE}`,
      inputSchema: getWeatherInputSchema.shape,
      outputSchema: weatherOutputSchema.shape,
    },
    createGetWeatherHandler(deps),
  );
}
