import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATION_BASELINE,
  NORMAL_STATION_BASELINE,
  NORMAL_STATION_BASELINE_FULL,
} from './station-baseline.fixtures.js';
import {
  getSeason,
  summarizeStationBaselineDay,
  summarizeStationBaselineDefault,
  summarizeStationBaselineFull,
} from './station-baseline.js';

describe('getSeason', () => {
  it('classifies Feb–Apr as peak_burning', () => {
    expect(getSeason('2026-02-01T00:00:00Z')).toBe('peak_burning');
    expect(getSeason('2026-03-15T00:00:00Z')).toBe('peak_burning');
    expect(getSeason('2026-04-30T00:00:00Z')).toBe('peak_burning');
  });

  it('classifies Oct–Jan as early_dry', () => {
    expect(getSeason('2026-10-01T00:00:00Z')).toBe('early_dry');
    expect(getSeason('2026-12-25T00:00:00Z')).toBe('early_dry');
    expect(getSeason('2026-01-15T00:00:00Z')).toBe('early_dry');
  });

  it('classifies May–Sep as monsoon', () => {
    expect(getSeason('2026-07-26T00:00:00Z')).toBe('monsoon');
    expect(getSeason('2026-05-01T00:00:00Z')).toBe('monsoon');
    expect(getSeason('2026-09-30T00:00:00Z')).toBe('monsoon');
  });
});

describe('summarizeStationBaselineDefault', () => {
  const today = new Date('2026-07-26T00:00:00Z');

  it('returns a no-data note for an empty baseline (bad station_id)', () => {
    const summary = summarizeStationBaselineDefault(EMPTY_STATION_BASELINE, null, null, '999999999', today);

    expect(summary.season).toBeUndefined();
    expect(summary.today).toBeUndefined();
    expect(summary.note).toContain('No baseline data for station 999999999');
  });

  it('aggregates the current season and reports today\'s row', () => {
    const summary = summarizeStationBaselineDefault(NORMAL_STATION_BASELINE, 2021, 2026, '225572', today);

    expect(summary.season).toEqual({
      season: 'monsoon',
      daysCovered: 2,
      minMedianPm25: 15.3,
      minMedianAqiCategory: 'Moderate',
      medianOfMedianPm25: 15.65,
      medianOfMedianAqiCategory: 'Moderate',
      maxMedianPm25: 16,
      maxMedianAqiCategory: 'Moderate',
    });
    expect(summary.today).toEqual({
      month: 7,
      day: 26,
      medianPm25: 16,
      medianAqiCategory: 'Moderate',
      p25Pm25: 13.9,
      p25AqiCategory: 'Moderate',
      p75Pm25: 20.3,
      p75AqiCategory: 'Moderate',
      n: 63,
      thin: false,
    });
    expect(summary.note).toBeUndefined();
  });

  it('notes when there is no row for today\'s day-of-year', () => {
    const summary = summarizeStationBaselineDefault(
      NORMAL_STATION_BASELINE,
      2021,
      2026,
      '225572',
      new Date('2026-08-15T00:00:00Z'),
    );

    expect(summary.today).toBeUndefined();
    expect(summary.note).toBe('No baseline row for 08-15.');
  });
});

describe('summarizeStationBaselineDay', () => {
  it('returns the matching row, flagged thin when n is below the gate', () => {
    const summary = summarizeStationBaselineDay(NORMAL_STATION_BASELINE, 2021, 2026, '225572', 7, 27);

    expect(summary.day).toEqual({
      month: 7,
      day: 27,
      medianPm25: 15.3,
      medianAqiCategory: 'Moderate',
      p25Pm25: 30.4,
      p25AqiCategory: 'Moderate',
      p75Pm25: 41.1,
      p75AqiCategory: 'Unhealthy for Sensitive Groups',
      n: 3,
      thin: true,
    });
  });

  it('notes when the requested month/day has no row', () => {
    const summary = summarizeStationBaselineDay(NORMAL_STATION_BASELINE, 2021, 2026, '225572', 2, 29);

    expect(summary.day).toBeUndefined();
    expect(summary.note).toBe('No baseline row for 02-29.');
  });

  it('returns a no-data note for an empty baseline', () => {
    const summary = summarizeStationBaselineDay(EMPTY_STATION_BASELINE, null, null, '999999999', 1, 1);
    expect(summary.note).toContain('No baseline data for station 999999999');
  });
});

describe('summarizeStationBaselineFull', () => {
  it('returns every row unmodified plus a thin flag, with no truncation', () => {
    const summary = summarizeStationBaselineFull(NORMAL_STATION_BASELINE_FULL, 2021, 2026, '225572');

    expect(summary.rows).toHaveLength(365);
    expect(summary.rows?.every((row) => row.thin === (row.n < 30))).toBe(true);
  });

  it('returns an empty rows array plus a no-data note for a bad station_id', () => {
    const summary = summarizeStationBaselineFull(EMPTY_STATION_BASELINE, null, null, '999999999');

    expect(summary.rows).toEqual([]);
    expect(summary.note).toContain('No baseline data for station 999999999');
  });

  it('never returns a bare PM2.5 number without an aqiCategory', () => {
    const summary = summarizeStationBaselineFull(NORMAL_STATION_BASELINE_FULL, 2021, 2026, '225572');

    for (const row of summary.rows ?? []) {
      expect(row.medianAqiCategory).not.toBeNull();
      expect(row.p25AqiCategory).not.toBeNull();
      expect(row.p75AqiCategory).not.toBeNull();
    }
  });
});
