import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { formatBboxParam } from '../logic/bbox.js';
import {
  fetchAndSummarizeWeather,
  weatherOutputSchema,
  type WeatherToolDeps,
  type WeatherToolResult,
} from '../logic/weather.js';
import { isoDateSchema } from '../schemas/date.js';
import { locationInput, resolveLocationInput } from '../schemas/location.js';
import { buildToolError } from '../logic/tool-response.js';

export const getWeatherInputSchema = z.object({
  ...locationInput.shape,
  date: isoDateSchema,
  include_raw_points: z.boolean().optional(),
});

export type GetWeatherInput = z.infer<typeof getWeatherInputSchema>;

export function createGetWeatherHandler(deps: WeatherToolDeps) {
  return async (input: GetWeatherInput): Promise<WeatherToolResult> => {
    const locationResult = await resolveLocationInput(input, deps.placeResolver);
    if (!locationResult.ok) {
      return buildToolError(locationResult.error.message);
    }

    const { bbox, note: locationNote } = locationResult.value;
    return fetchAndSummarizeWeather(
      deps.client,
      '/api/weather',
      { date: input.date, bbox: formatBboxParam(bbox) },
      input.include_raw_points ?? false,
      `No weather data ingested for ${input.date} yet.`,
      locationNote,
    );
  };
}

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
        '`include_raw_points` to get individual grid points instead (capped, with a note if truncated).',
      inputSchema: getWeatherInputSchema.shape,
      outputSchema: weatherOutputSchema.shape,
    },
    createGetWeatherHandler(deps),
  );
}
