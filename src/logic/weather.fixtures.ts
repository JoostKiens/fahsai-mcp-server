import type { WeatherGridPointRaw } from './weather.js';

export function fakeWeatherPoint(overrides: Partial<WeatherGridPointRaw> = {}): WeatherGridPointRaw {
  return {
    lat: 10,
    lng: 100,
    wind_speed_kmh: 15,
    wind_direction_deg: 90,
    relative_humidity_2m: 70,
    precipitation_sum: 2,
    ...overrides,
  };
}

export const EMPTY_WEATHER_POINTS: readonly WeatherGridPointRaw[] = [];

// A non-finite wind_direction_deg — a malformed upstream reading fahsai-client's unvalidated
// JSON cast can't catch. Used to verify aggregation/point-mapping degrades to a null wind
// instead of throwing (parseWindDir would throw on this; parseWindDirOrNull must not).
export const MALFORMED_WIND_POINT: WeatherGridPointRaw = fakeWeatherPoint({ wind_direction_deg: NaN });

// Two points, same cell (well within WEATHER_CELL_SIZE_DEG of each other), both blowing
// from due east (90 deg) at different speeds — same-direction vectors average cleanly, so
// the aggregate should land on exactly 90 deg / the arithmetic mean speed. Used to
// hand-verify the vector-averaging math in tests.
export const TWO_POINTS_SAME_DIRECTION: readonly WeatherGridPointRaw[] = [
  fakeWeatherPoint({
    lat: 10,
    lng: 100,
    wind_speed_kmh: 10,
    wind_direction_deg: 90,
    precipitation_sum: 1,
    relative_humidity_2m: 60,
  }),
  fakeWeatherPoint({
    lat: 12,
    lng: 102,
    wind_speed_kmh: 20,
    wind_direction_deg: 90,
    precipitation_sum: 3,
    relative_humidity_2m: 80,
  }),
];

// Two clusters far enough apart (89,1 vs 110,10) that binning at WEATHER_CELL_SIZE_DEG (3)
// must produce at least 2 separate cells.
export const TWO_CELL_POINTS: readonly WeatherGridPointRaw[] = [
  fakeWeatherPoint({ lat: 1, lng: 89, wind_speed_kmh: 10, wind_direction_deg: 90 }),
  fakeWeatherPoint({ lat: 1.5, lng: 89.5, wind_speed_kmh: 12, wind_direction_deg: 90 }),
  fakeWeatherPoint({ lat: 10, lng: 110, wind_speed_kmh: 20, wind_direction_deg: 180 }),
  fakeWeatherPoint({ lat: 10.5, lng: 110.5, wind_speed_kmh: 22, wind_direction_deg: 180 }),
];

// 1,200 points — above WEATHER_RAW_POINTS_MAX (1000) — spread across a grid so stride
// sampling in tests isn't sampling a degenerate single-value array.
export const LARGE_WEATHER_GRID: readonly WeatherGridPointRaw[] = Array.from({ length: 1200 }, (_, i) =>
  fakeWeatherPoint({
    lat: 1 + (i % 60) * 0.4,
    lng: 89 + Math.floor(i / 60) * 0.4,
    wind_speed_kmh: 10 + (i % 10),
    wind_direction_deg: (i * 3) % 360,
  }),
);
