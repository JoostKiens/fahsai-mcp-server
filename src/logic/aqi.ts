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
