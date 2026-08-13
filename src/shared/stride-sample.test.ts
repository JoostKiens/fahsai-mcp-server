import { describe, expect, it } from 'vitest';

import { strideSample } from './stride-sample.js';

describe('strideSample', () => {
  it('returns all items unchanged when under the cap', () => {
    expect(strideSample([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });

  it('evenly samples down to max, keeping first and spreading across the range', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(strideSample(items, 5)).toEqual([0, 2, 4, 6, 8]);
  });

  it('returns exactly max items, never more', () => {
    const items = Array.from({ length: 4599 }, (_, i) => i);
    expect(strideSample(items, 1000)).toHaveLength(1000);
  });
});
