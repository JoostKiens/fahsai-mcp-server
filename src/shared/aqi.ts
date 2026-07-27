const BREAKPOINTS = [
  { max: 12.0, category: 'Good' },
  { max: 35.4, category: 'Moderate' },
  { max: 55.4, category: 'Unhealthy for Sensitive Groups' },
  { max: 150.4, category: 'Unhealthy' },
  { max: 250.4, category: 'Very Unhealthy' },
] as const;

export type AqiCategory = (typeof BREAKPOINTS)[number]['category'] | 'Hazardous';

export interface AqiResult {
  readonly category: AqiCategory;
  readonly pm25: number;
}

export function classifyAqi(pm25: number): AqiResult {
  if (!Number.isFinite(pm25) || pm25 < 0) {
    throw new RangeError(`classifyAqi: invalid pm25 value: ${pm25}`);
  }
  for (const { max, category } of BREAKPOINTS) {
    if (pm25 <= max) return { category, pm25 };
  }
  return { category: 'Hazardous', pm25 };
}

// classifyAqi throws for a non-finite or negative pm25 — a real possibility for any tool
// reading raw Fahsai API values (fahsai-client does no runtime validation on the JSON body).
// This is the shared "one malformed reading shouldn't abort the whole response" policy used
// by every station-reading tool (get_station_readings, get_station_readings_history, ...):
// map an invalid value to null instead of throwing, so callers can omit/skip it.
export function classifyAqiOrNull(pm25: number): AqiResult | null {
  if (!Number.isFinite(pm25) || pm25 < 0) return null;
  return classifyAqi(pm25);
}
