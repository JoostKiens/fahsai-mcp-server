import { describe, expect, it } from 'vitest';

import { aggregateWeatherPoints, emptyWeatherSummary, summarizeWeather, WEATHER_RAW_POINTS_MAX } from './weather.js';
import {
  EMPTY_WEATHER_POINTS,
  fakeWeatherPoint,
  LARGE_WEATHER_GRID,
  MALFORMED_WIND_POINT,
  TWO_CELL_POINTS,
  TWO_POINTS_SAME_DIRECTION,
} from './weather.fixtures.js';

describe('aggregateWeatherPoints', () => {
  it('vector-averages same-direction wind readings to the arithmetic mean speed/direction', () => {
    const aggregate = aggregateWeatherPoints(TWO_POINTS_SAME_DIRECTION);

    expect(aggregate.pointCount).toBe(2);
    expect(aggregate.windSpeedKmh).toBeCloseTo(15); // mean of 10 and 20
    expect(aggregate.wind?.fromLabel).toBe('E');
    expect(aggregate.wind?.toLabel).toBe('W');
    expect(aggregate.precipitationSumMm).toBeCloseTo(2); // mean of 1 and 3
    expect(aggregate.relativeHumidity2m).toBeCloseTo(70); // mean of 60 and 80
    expect(aggregate.lat).toBeCloseTo(11); // mean of 10 and 12
    expect(aggregate.lng).toBeCloseTo(101); // mean of 100 and 102
  });

  it('returns an all-null aggregate for an empty input, without dividing by zero', () => {
    const aggregate = aggregateWeatherPoints(EMPTY_WEATHER_POINTS);

    expect(aggregate.pointCount).toBe(0);
    expect(aggregate.windSpeedKmh).toBeNull();
    expect(aggregate.wind).toBeNull();
    expect(aggregate.precipitationSumMm).toBeNull();
    expect(aggregate.relativeHumidity2m).toBeNull();
  });

  it('degrades to a null wind/windSpeedKmh (never throws) when a point has a non-finite wind_direction_deg', () => {
    const points = [fakeWeatherPoint(), MALFORMED_WIND_POINT];

    expect(() => aggregateWeatherPoints(points)).not.toThrow();
    const aggregate = aggregateWeatherPoints(points);
    expect(aggregate.wind).toBeNull();
    expect(aggregate.windSpeedKmh).toBeNull();
    // Fields independent of the wind computation are unaffected.
    expect(aggregate.pointCount).toBe(2);
  });
});

describe('summarizeWeather', () => {
  it('bins points into separate cells when they fall in different regions', () => {
    const summary = summarizeWeather(TWO_CELL_POINTS, false);

    expect(summary.total).toBe(4);
    expect(summary.cells.length).toBeGreaterThanOrEqual(2);
    const totalBinned = summary.cells.reduce((sum, cell) => sum + cell.pointCount, 0);
    expect(totalBinned).toBe(4);
  });

  it('omits rawPoints by default', () => {
    const summary = summarizeWeather(TWO_CELL_POINTS, false);
    expect(summary.rawPoints).toBeUndefined();
  });

  it('includes individually wind-formatted rawPoints when requested', () => {
    const summary = summarizeWeather(TWO_CELL_POINTS, true);

    expect(summary.rawPoints).toHaveLength(4);
    expect(summary.rawPointsTruncated).toBe(false);
    expect(summary.rawPoints?.[0].wind?.fromLabel).toBeDefined();
  });

  it('surfaces a null wind (never throws) for a raw point with a non-finite wind_direction_deg', () => {
    const points = [MALFORMED_WIND_POINT];

    expect(() => summarizeWeather(points, true)).not.toThrow();
    const summary = summarizeWeather(points, true);
    expect(summary.rawPoints?.[0].wind).toBeNull();
  });

  it('stride-samples and truncates rawPoints above the cap, with a note', () => {
    const summary = summarizeWeather(LARGE_WEATHER_GRID, true);

    expect(summary.total).toBe(1200);
    expect(summary.rawPoints).toHaveLength(WEATHER_RAW_POINTS_MAX);
    expect(summary.rawPointsTruncated).toBe(true);
    expect(summary.note).toContain(`${WEATHER_RAW_POINTS_MAX} of 1200`);
  });
});

describe('emptyWeatherSummary', () => {
  it('represents "no data" with zero points and a null aggregate', () => {
    const summary = emptyWeatherSummary();

    expect(summary.total).toBe(0);
    expect(summary.cells).toEqual([]);
    expect(summary.summary.pointCount).toBe(0);
  });
});
