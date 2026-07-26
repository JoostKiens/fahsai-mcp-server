import { describe, expect, it } from 'vitest';

import { EMPTY_STATION_READINGS, SMALL_STATION_READINGS } from './station-readings.fixtures.js';
import { summarizeStationReadings } from './station-readings.js';

describe('summarizeStationReadings', () => {
  it('returns total 0 and an empty readings array for no stations', () => {
    const summary = summarizeStationReadings(EMPTY_STATION_READINGS);
    expect(summary).toEqual({ total: 0, readings: [] });
  });

  it('maps every reading, attaching pm25 and aqiCategory per station', () => {
    const summary = summarizeStationReadings(SMALL_STATION_READINGS);

    expect(summary.total).toBe(4);
    expect(summary.readings).toHaveLength(4);
    expect(summary.readings[0]).toMatchObject({ stationId: '1', pm25: 5.33, aqiCategory: 'Good' });
    expect(summary.readings[1]).toMatchObject({
      stationId: '2',
      pm25: 20,
      aqiCategory: 'Moderate',
    });
    expect(summary.readings[2]).toMatchObject({
      stationId: '3',
      pm25: 45,
      aqiCategory: 'Unhealthy for Sensitive Groups',
    });
  });

  it('passes attribution through unchanged when present on the raw entry', () => {
    const summary = summarizeStationReadings(SMALL_STATION_READINGS);

    expect(summary.readings[3]?.attribution).toEqual({
      name: 'Example Provider',
      url: 'https://example.test/attribution',
    });
  });

  it('omits the attribution field entirely for stations that carry none', () => {
    const summary = summarizeStationReadings(SMALL_STATION_READINGS);

    expect(summary.readings[0]).not.toHaveProperty('attribution');
  });
});
