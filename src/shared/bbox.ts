export interface BoundingBox {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

// Covers Thailand, Myanmar, Laos, Cambodia (+ partial Vietnam/India/China/Bangladesh) —
// matches Fahsai's own API default bbox.
export const FAHSAI_DATA_BBOX: BoundingBox = { west: 89, south: 1, east: 114, north: 30 };

// ponytail: flat conversion, no cos(lat) correction — makes the east-west extent up to
// ~15% wider than a true circle at 30°N (northern Myanmar), never narrower. Fine for a
// "search nearby" bbox filter; add cos(lat) correction if a tool ever needs tighter precision.
const KM_PER_DEGREE = 111;

export function radiusKmToBbox(
  lat: number,
  lng: number,
  radiusKm: number,
): BoundingBox {
  const offset = radiusKm / KM_PER_DEGREE;
  return {
    west: lng - offset,
    south: lat - offset,
    east: lng + offset,
    north: lat + offset,
  };
}

// Intersects `bbox` with `dataBbox`. Returns null when there's no overlap at all —
// callers should treat that as "outside coverage," not silently return an empty-looking bbox.
export function clampToDataBbox(
  bbox: BoundingBox,
  dataBbox: BoundingBox,
): BoundingBox | null {
  const west = Math.max(bbox.west, dataBbox.west);
  const south = Math.max(bbox.south, dataBbox.south);
  const east = Math.min(bbox.east, dataBbox.east);
  const north = Math.min(bbox.north, dataBbox.north);

  if (west >= east || south >= north) {
    return null;
  }

  return { west, south, east, north };
}

// Fahsai's `bbox` query param format across every route: "west,south,east,north".
export function formatBboxParam(bbox: BoundingBox): string {
  return `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
}
