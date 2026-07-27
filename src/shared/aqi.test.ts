import { describe, expect, it } from 'vitest';

import { classifyAqi, classifyAqiOrNull } from './aqi.js';

describe('classifyAqi', () => {
  it('classifies Good (0–12.0)', () => {
    expect(classifyAqi(0).category).toBe('Good');
    expect(classifyAqi(6).category).toBe('Good');
    expect(classifyAqi(12.0).category).toBe('Good');
  });

  it('classifies Moderate (12.1–35.4)', () => {
    expect(classifyAqi(12.1).category).toBe('Moderate');
    expect(classifyAqi(24).category).toBe('Moderate');
    expect(classifyAqi(35.4).category).toBe('Moderate');
  });

  it('classifies Unhealthy for Sensitive Groups (35.5–55.4)', () => {
    expect(classifyAqi(35.5).category).toBe('Unhealthy for Sensitive Groups');
    expect(classifyAqi(45).category).toBe('Unhealthy for Sensitive Groups');
    expect(classifyAqi(55.4).category).toBe('Unhealthy for Sensitive Groups');
  });

  it('classifies Unhealthy (55.5–150.4)', () => {
    expect(classifyAqi(55.5).category).toBe('Unhealthy');
    expect(classifyAqi(100).category).toBe('Unhealthy');
    expect(classifyAqi(150.4).category).toBe('Unhealthy');
  });

  it('classifies Very Unhealthy (150.5–250.4)', () => {
    expect(classifyAqi(150.5).category).toBe('Very Unhealthy');
    expect(classifyAqi(200).category).toBe('Very Unhealthy');
    expect(classifyAqi(250.4).category).toBe('Very Unhealthy');
  });

  it('classifies Hazardous (250.5+)', () => {
    expect(classifyAqi(250.5).category).toBe('Hazardous');
    expect(classifyAqi(500).category).toBe('Hazardous');
  });

  it('passes pm25 through unchanged', () => {
    expect(classifyAqi(37.8).pm25).toBe(37.8);
  });

  it('throws RangeError for NaN', () => {
    expect(() => classifyAqi(NaN)).toThrow(RangeError);
  });

  it('throws RangeError for Infinity', () => {
    expect(() => classifyAqi(Infinity)).toThrow(RangeError);
  });

  it('throws RangeError for negative pm25', () => {
    expect(() => classifyAqi(-1)).toThrow(RangeError);
  });
});

describe('classifyAqiOrNull', () => {
  it('returns the same result as classifyAqi for a valid value', () => {
    expect(classifyAqiOrNull(45)).toEqual(classifyAqi(45));
  });

  it('returns null instead of throwing for NaN', () => {
    expect(classifyAqiOrNull(NaN)).toBeNull();
  });

  it('returns null instead of throwing for Infinity', () => {
    expect(classifyAqiOrNull(Infinity)).toBeNull();
  });

  it('returns null instead of throwing for a negative value', () => {
    expect(classifyAqiOrNull(-1)).toBeNull();
  });
});
