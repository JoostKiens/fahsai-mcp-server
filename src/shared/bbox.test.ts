import { describe, expect, it } from 'vitest';

import { FAHSAI_DATA_BBOX, clampToDataBbox, formatBboxParam, radiusKmToBbox } from './bbox.js';

describe('radiusKmToBbox', () => {
  it('converts a point + radius to a symmetric bbox using a flat km-per-degree constant', () => {
    const bbox = radiusKmToBbox(13.75, 100.5, 111);
    expect(bbox.west).toBeCloseTo(99.5, 5);
    expect(bbox.east).toBeCloseTo(101.5, 5);
    expect(bbox.south).toBeCloseTo(12.75, 5);
    expect(bbox.north).toBeCloseTo(14.75, 5);
  });

  it('uses the default 55km radius to produce roughly a ±0.5° bbox', () => {
    const bbox = radiusKmToBbox(18, 99, 55);
    expect(bbox.west).toBeCloseTo(98.5045, 3);
    expect(bbox.east).toBeCloseTo(99.4955, 3);
  });
});

describe('clampToDataBbox', () => {
  it('returns the bbox unchanged when fully inside the data bbox', () => {
    const bbox = { west: 98, south: 15, east: 100, north: 17 };
    expect(clampToDataBbox(bbox, FAHSAI_DATA_BBOX)).toEqual(bbox);
  });

  it('clamps a bbox that partially overlaps the data bbox', () => {
    const bbox = { west: 87, south: 15, east: 100, north: 17 };
    expect(clampToDataBbox(bbox, FAHSAI_DATA_BBOX)).toEqual({ west: 89, south: 15, east: 100, north: 17 });
  });

  it('returns null when the bbox does not overlap the data bbox at all', () => {
    const bbox = { west: 40, south: 40, east: 41, north: 41 };
    expect(clampToDataBbox(bbox, FAHSAI_DATA_BBOX)).toBeNull();
  });

  it('returns null when bboxes only touch at an edge (zero-area overlap)', () => {
    const bbox = { west: 84, south: 1, east: 89, north: 30 };
    expect(clampToDataBbox(bbox, FAHSAI_DATA_BBOX)).toBeNull();
  });
});

describe('formatBboxParam', () => {
  it('serializes a bbox as "west,south,east,north"', () => {
    expect(formatBboxParam({ west: 89, south: 1, east: 114, north: 30 })).toBe('89,1,114,30');
  });

  it('serializes negative and decimal coordinates unchanged', () => {
    expect(formatBboxParam({ west: -10.5, south: 40.25, east: 10, north: 50 })).toBe('-10.5,40.25,10,50');
  });
});
