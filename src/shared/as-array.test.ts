import { describe, expect, it } from 'vitest';

import { asArray } from './as-array.js';

describe('asArray', () => {
  it('passes through an array unchanged', () => {
    expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns [] for null, undefined, and non-array values', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray('not an array')).toEqual([]);
    expect(asArray({ data: [] })).toEqual([]);
  });
});
