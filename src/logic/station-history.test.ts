import { describe, expect, it } from 'vitest';

import {
  BOGUS_STATION_ID_HISTORY,
  EMPTY_STATION_HISTORY,
  NORMAL_STATION_HISTORY,
  STATION_HISTORY_WITH_NO_DATA_DAY,
  STATION_HISTORY_WITH_NULL_FIELDS,
} from './station-history.fixtures.js';
import { emptyStationHistorySummary, summarizeStationHistory } from './station-history.js';

describe('summarizeStationHistory', () => {
  it('returns an empty days array for no data', () => {
    const summary = summarizeStationHistory(EMPTY_STATION_HISTORY, '225572', 7);
    expect(summary).toEqual({ stationId: '225572', daysRequested: 7, days: [] });
  });

  it('matches emptyStationHistorySummary for no data', () => {
    expect(summarizeStationHistory(EMPTY_STATION_HISTORY, '225572', 7)).toEqual(
      emptyStationHistorySummary('225572', 7),
    );
  });

  it('maps a normal day, attaching pm25/aqiCategory and formatting wind, never surfacing raw windDirectionDeg', () => {
    const summary = summarizeStationHistory(NORMAL_STATION_HISTORY, '225572', 7);

    expect(summary.days).toHaveLength(2);
    const [first] = summary.days;
    expect(first).toEqual({
      date: '2026-06-16',
      pm25: 16.5,
      aqiCategory: 'Moderate',
      readingCount: 1,
      weather: {
        windSpeedKmh: 5.5,
        precipitationSumMm: 24.6,
        relativeHumidity2m: 44,
        wind: { fromLabel: 'NW', toLabel: 'SE', fromQuadrant: 'NW', toQuadrant: 'SE' },
      },
      baseline: { medianPm25: 16, p25Pm25: 13.9, p75Pm25: 20.3, n: 63 },
    });
    expect(JSON.stringify(first)).not.toContain('windDirectionDeg');
  });

  it('nulls pm25/aqiCategory for a readingCount:0 sentinel day instead of classifying pm25:0', () => {
    const summary = summarizeStationHistory(STATION_HISTORY_WITH_NO_DATA_DAY, '225572', 7);

    expect(summary.days[0].readingCount).toBe(0);
    expect(summary.days[0].pm25).toBeNull();
    expect(summary.days[0].aqiCategory).toBeNull();
  });

  it('preserves weather:null and baseline:null explicitly, not omitted', () => {
    const summary = summarizeStationHistory(STATION_HISTORY_WITH_NULL_FIELDS, '225572', 7);

    expect(summary.days[0]).toHaveProperty('weather', null);
    expect(summary.days[0]).toHaveProperty('baseline', null);
  });

  it('handles a bogus station_id (200 with a full window of null/sentinel days) without throwing', () => {
    const summary = summarizeStationHistory(BOGUS_STATION_ID_HISTORY, '999999999', 7);

    expect(summary.days).toHaveLength(7);
    for (const day of summary.days) {
      expect(day.pm25).toBeNull();
      expect(day.aqiCategory).toBeNull();
      expect(day.weather).toBeNull();
      expect(day.baseline).toBeNull();
    }
  });
});
