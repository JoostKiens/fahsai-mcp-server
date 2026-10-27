// US EPA PM2.5 breakpoints, 2024 revision (effective 6 Feb 2024).
const BREAKPOINTS = [
  { max: 9.0, category: 'Good' },
  { max: 35.4, category: 'Moderate' },
  { max: 55.4, category: 'Unhealthy for Sensitive Groups' },
  { max: 125.4, category: 'Unhealthy' },
  { max: 225.4, category: 'Very Unhealthy' },
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
  // EPA truncates to one decimal before lookup, so e.g. 9.05 is Good, not in a gap above 9.0.
  // The epsilon keeps a computed mean like 9.099999999999999 (three 9.1s) from dropping to 9.0.
  const truncated = Math.floor(pm25 * 10 + 1e-9) / 10;
  for (const { max, category } of BREAKPOINTS) {
    if (truncated <= max) return { category, pm25 };
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
