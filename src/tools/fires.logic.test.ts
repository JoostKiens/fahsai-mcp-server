import { describe, expect, it } from 'vitest';

import { FIRE_LIST_TRUNCATION_THRESHOLD } from './fires.constants.js';
import { EMPTY_FIRES, LARGE_FIRES, SMALL_FIRES } from './fires.fixtures.js';
import { summarizeFires } from './fires.logic.js';

describe('summarizeFires', () => {
  it('summarizes an empty day with zero counts and no truncation', () => {
    const summary = summarizeFires(EMPTY_FIRES);

    expect(summary).toEqual({
      total: 0,
      byConfidence: { high: 0, nominal: 0, low: 0, unknown: 0 },
      points: [],
      truncated: false,
    });
  });

  it('returns the full trimmed list and confidence breakdown when under the threshold', () => {
    const summary = summarizeFires(SMALL_FIRES);

    expect(summary.total).toBe(4);
    expect(summary.truncated).toBe(false);
    expect(summary.note).toBeUndefined();
    expect(summary.byConfidence).toEqual({ high: 1, nominal: 1, low: 1, unknown: 1 });
    expect(summary.points).toHaveLength(4);
    expect(summary.points[0]).toEqual({
      id: 1,
      detectedAt: '2026-04-18T06:12:00Z',
      lat: 18.7883,
      lng: 98.9853,
      frp: 5,
      confidence: 'high',
      satellite: 'N',
      daynight: 'D',
      countryId: 'THA',
    });
    expect(summary.points[0]).not.toHaveProperty('brightTi4');
    expect(summary.points[0]).not.toHaveProperty('brightTi5');
  });

  it('truncates to the top-N by FRP (descending) when over the threshold, noting the omitted count', () => {
    const summary = summarizeFires(LARGE_FIRES);

    expect(summary.total).toBe(60);
    expect(summary.truncated).toBe(true);
    expect(summary.points).toHaveLength(FIRE_LIST_TRUNCATION_THRESHOLD);
    expect(summary.note).toBe(
      'Showing the top 50 fires by fire radiative power (FRP); 10 more fire(s) omitted.',
    );
    // Highest FRP (59, id 60) first; lowest surviving FRP (10, id 11) last.
    expect(summary.points[0]).toMatchObject({ id: 60, frp: 59 });
    expect(summary.points[summary.points.length - 1]).toMatchObject({ id: 11, frp: 10 });
  });

  it('sorts a null-FRP point last, dropping it first when truncating', () => {
    const withDistinctFrp = Array.from({ length: 50 }, (_, i) => ({ ...SMALL_FIRES[0], id: i + 1, frp: 50 - i }));
    const points = [...withDistinctFrp, { ...SMALL_FIRES[0], id: 51, frp: null }];

    const summary = summarizeFires(points);

    expect(summary.total).toBe(51);
    expect(summary.truncated).toBe(true);
    expect(summary.points).toHaveLength(50);
    expect(summary.points.map((p) => p.id)).not.toContain(51);
    expect(summary.points[0]).toMatchObject({ id: 1, frp: 50 });
    expect(summary.points[49]).toMatchObject({ id: 50, frp: 1 });
  });
});
