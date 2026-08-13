import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Cache } from './cache.js';

describe('Cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for a key that was never set', () => {
    const cache = new Cache<number>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('returns a set value before it expires', () => {
    const cache = new Cache<number>(1000);
    cache.set('a', 42);
    vi.advanceTimersByTime(999);
    expect(cache.get('a')).toBe(42);
  });

  it('expires a value once its TTL has passed', () => {
    const cache = new Cache<number>(1000);
    cache.set('a', 42);
    vi.advanceTimersByTime(1000);
    expect(cache.get('a')).toBeUndefined();
  });

  it('overwrites an existing entry and resets its TTL', () => {
    const cache = new Cache<number>(1000);
    cache.set('a', 1);
    vi.advanceTimersByTime(900);
    cache.set('a', 2);
    vi.advanceTimersByTime(900);
    expect(cache.get('a')).toBe(2);
  });
});
