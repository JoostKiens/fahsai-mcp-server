import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATION_READINGS_HISTORY,
  SMALL_STATION_READINGS_HISTORY,
  SPARSE_STATION_READINGS_HISTORY,
  STATION_READINGS_HISTORY_WITH_INVALID_VALUE,
} from './station-readings-history.fixtures.js';
import {
  emptyStationReadingsHistorySummary,
  summarizeStationReadingsHistory,
} from './station-readings-history.js';

describe('summarizeStationReadingsHistory', () => {
  it('returns total 0 and an empty readings array for no data', () => {
    const summary = summarizeStationReadingsHistory(EMPTY_STATION_READINGS_HISTORY, '6289999', 168);
    expect(summary).toEqual({ stationId: '6289999', hoursRequested: 168, total: 0, readings: [] });
  });

  it('matches emptyStationReadingsHistorySummary for no data', () => {
    expect(summarizeStationReadingsHistory(EMPTY_STATION_READINGS_HISTORY, '6289999', 24)).toEqual(
      emptyStationReadingsHistorySummary('6289999', 24),
    );
  });

  it('maps every point, attaching pm25 and aqiCategory, preserving order', () => {
    const summary = summarizeStationReadingsHistory(SMALL_STATION_READINGS_HISTORY, '6289999', 168);

    expect(summary.stationId).toBe('6289999');
    expect(summary.hoursRequested).toBe(168);
    expect(summary.total).toBe(6);
    expect(summary.readings.map((r) => r.aqiCategory)).toEqual([
      'Moderate',
      'Moderate',
      'Moderate',
      'Moderate',
      'Good',
      'Very Unhealthy',
    ]);
    expect(summary.readings[0]).toEqual({
      measuredAt: '2026-07-20T00:00:00+00:00',
      pm25: 33.7,
      aqiCategory: 'Moderate',
    });
    expect(summary.note).toBeUndefined();
  });

  it('summarizes a sparse/gappy series with no special-casing', () => {
    const summary = summarizeStationReadingsHistory(SPARSE_STATION_READINGS_HISTORY, '6289999', 168);

    expect(summary.total).toBe(2);
    expect(summary.readings).toHaveLength(2);
    expect(summary.note).toBeUndefined();
  });

  it('omits points with an invalid pm25 value instead of throwing, with a note', () => {
    const summary = summarizeStationReadingsHistory(
      STATION_READINGS_HISTORY_WITH_INVALID_VALUE,
      '6289999',
      168,
    );

    expect(summary.total).toBe(2);
    expect(summary.readings.map((r) => r.pm25)).toEqual([5.33, 20]);
    expect(summary.note).toBe('2 reading(s) omitted for an invalid PM2.5 value.');
  });
});
