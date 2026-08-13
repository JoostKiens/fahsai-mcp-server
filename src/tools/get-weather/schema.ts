import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { isoDateSchema } from '../../shared/schema/date.js';
import { locationInput } from '../../shared/schema/location.js';
import type { WindDir } from '../../shared/wind.js';

export const getWeatherInputSchema = z.object({
  ...locationInput.shape,
  date: isoDateSchema,
  include_raw_points: z.boolean().optional(),
});

export type GetWeatherInput = z.infer<typeof getWeatherInputSchema>;

export interface WeatherAggregate {
  readonly lat: number;
  readonly lng: number;
  readonly pointCount: number;
  readonly windSpeedKmh: number | null;
  readonly wind: WindDir | null;
  readonly precipitationSumMm: number | null;
  readonly relativeHumidity2m: number | null;
}

export type WeatherCell = WeatherAggregate;

export interface WeatherPoint {
  readonly lat: number;
  readonly lng: number;
  readonly windSpeedKmh: number;
  readonly wind: WindDir | null;
  readonly precipitationSumMm: number;
  readonly relativeHumidity2m: number;
}

export interface WeatherSummary {
  readonly total: number;
  readonly cells: readonly WeatherCell[];
  readonly summary: WeatherAggregate;
  readonly rawPoints?: readonly WeatherPoint[];
  readonly rawPointsTruncated?: boolean;
  readonly note?: string;
}

const windOutputSchema = z.object({
  fromLabel: z.string(),
  toLabel: z.string(),
});

const weatherAggregateOutputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  pointCount: z.number(),
  windSpeedKmh: z.number().nullable(),
  wind: windOutputSchema.nullable(),
  precipitationSumMm: z.number().nullable(),
  relativeHumidity2m: z.number().nullable(),
});

const weatherPointOutputSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  windSpeedKmh: z.number(),
  wind: windOutputSchema.nullable(),
  precipitationSumMm: z.number(),
  relativeHumidity2m: z.number(),
});

export const weatherOutputSchema = z.object({
  total: z.number(),
  cells: z.array(weatherAggregateOutputSchema),
  summary: weatherAggregateOutputSchema,
  rawPoints: z.array(weatherPointOutputSchema).optional(),
  rawPointsTruncated: z.boolean().optional(),
  note: z.string().optional(),
});

export type WeatherToolResult = CallToolResult;
