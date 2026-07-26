const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassLabel = (typeof DIRECTIONS)[number];

export interface WindDir {
  readonly fromLabel: CompassLabel;
  readonly toLabel: CompassLabel;
  readonly fromQuadrant: CompassLabel;
  readonly toQuadrant: CompassLabel;
}

export function parseWindDir(directionDeg: number): WindDir {
  if (!Number.isFinite(directionDeg)) {
    throw new RangeError(`parseWindDir: invalid directionDeg value: ${directionDeg}`);
  }
  const idx = Math.round((((directionDeg % 360) + 360) % 360) / 45) % 8;
  const fromLabel = DIRECTIONS[idx];
  const toLabel = DIRECTIONS[(idx + 4) % 8];
  return { fromLabel, toLabel, fromQuadrant: fromLabel, toQuadrant: toLabel };
}
