import { describe, expect, it } from 'vitest';

import { locationInput } from './location.js';

describe('locationInput', () => {
  it('rejects a bbox with swapped corners (west >= east or south >= north)', () => {
    const result = locationInput.safeParse({ bbox: { west: 101, south: 14, east: 100, north: 13 } });

    expect(result.success).toBe(false);
  });

  it('accepts a well-formed bbox', () => {
    const result = locationInput.safeParse({ bbox: { west: 100, south: 13, east: 101, north: 14 } });

    expect(result.success).toBe(true);
  });
});
