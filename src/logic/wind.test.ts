import { describe, expect, it } from 'vitest';

import { parseWindDir } from './wind.js';

describe('parseWindDir', () => {
  it('handles cardinal directions', () => {
    expect(parseWindDir(0)).toMatchObject({ fromLabel: 'N', toLabel: 'S' });
    expect(parseWindDir(90)).toMatchObject({ fromLabel: 'E', toLabel: 'W' });
    expect(parseWindDir(180)).toMatchObject({ fromLabel: 'S', toLabel: 'N' });
    expect(parseWindDir(270)).toMatchObject({ fromLabel: 'W', toLabel: 'E' });
  });

  it('handles intercardinal directions', () => {
    expect(parseWindDir(45)).toMatchObject({ fromLabel: 'NE', toLabel: 'SW' });
    expect(parseWindDir(135)).toMatchObject({ fromLabel: 'SE', toLabel: 'NW' });
    expect(parseWindDir(225)).toMatchObject({ fromLabel: 'SW', toLabel: 'NE' });
    expect(parseWindDir(315)).toMatchObject({ fromLabel: 'NW', toLabel: 'SE' });
  });

  it('wraps 360° back to N', () => {
    expect(parseWindDir(360)).toMatchObject({ fromLabel: 'N', toLabel: 'S' });
  });

  it('handles negative degrees', () => {
    expect(parseWindDir(-90)).toMatchObject({ fromLabel: 'W', toLabel: 'E' });
  });

  it('rounds to nearest sector at boundaries', () => {
    expect(parseWindDir(22.4)).toMatchObject({ fromLabel: 'N' });
    expect(parseWindDir(22.6)).toMatchObject({ fromLabel: 'NE' });
  });

  it('sets fromQuadrant === fromLabel and toQuadrant === toLabel', () => {
    const result = parseWindDir(135);
    expect(result.fromQuadrant).toBe(result.fromLabel);
    expect(result.toQuadrant).toBe(result.toLabel);
  });
});
