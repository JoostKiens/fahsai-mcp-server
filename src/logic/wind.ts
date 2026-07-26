const DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassLabel = (typeof DIRECTIONS)[number];

const OPPOSITES: Readonly<Record<CompassLabel, CompassLabel>> = {
  N: 'S',
  NE: 'SW',
  E: 'W',
  SE: 'NW',
  S: 'N',
  SW: 'NE',
  W: 'E',
  NW: 'SE',
};

export interface WindDir {
  readonly fromLabel: CompassLabel;
  readonly toLabel: CompassLabel;
  readonly fromQuadrant: CompassLabel;
  readonly toQuadrant: CompassLabel;
}

export function parseWindDir(directionDeg: number): WindDir {
  const idx = Math.round((((directionDeg % 360) + 360) % 360) / 45) % 8;
  const fromLabel = DIRECTIONS[idx];
  const toLabel = OPPOSITES[fromLabel];
  return { fromLabel, toLabel, fromQuadrant: fromLabel, toQuadrant: toLabel };
}
