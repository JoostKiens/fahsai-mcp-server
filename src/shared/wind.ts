const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassLabel = (typeof DIRECTIONS)[number];

export interface WindDir {
  readonly fromLabel: CompassLabel;
  readonly toLabel: CompassLabel;
}

export function parseWindDir(directionDeg: number): WindDir {
  if (!Number.isFinite(directionDeg)) {
    throw new RangeError(`parseWindDir: invalid directionDeg value: ${directionDeg}`);
  }
  const idx = Math.round((((directionDeg % 360) + 360) % 360) / 45) % 8;
  const fromLabel = DIRECTIONS[idx];
  const toLabel = DIRECTIONS[(idx + 4) % 8];
  return { fromLabel, toLabel };
}

// parseWindDir throws for a non-finite directionDeg — a real possibility for any tool reading
// raw Fahsai API values (fahsai-client does no runtime validation on the JSON body). Mirrors
// aqi.ts's classifyAqiOrNull: one malformed reading shouldn't abort the whole response.
export function parseWindDirOrNull(directionDeg: number): WindDir | null {
  if (!Number.isFinite(directionDeg)) return null;
  return parseWindDir(directionDeg);
}
