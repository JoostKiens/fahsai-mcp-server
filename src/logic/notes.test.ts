import { describe, expect, it } from 'vitest';

import { combineNotes } from './notes.js';

describe('combineNotes', () => {
  it('returns undefined when no notes are present', () => {
    expect(combineNotes()).toBeUndefined();
    expect(combineNotes(undefined, undefined)).toBeUndefined();
  });

  it('returns a single note unchanged', () => {
    expect(combineNotes('only note')).toBe('only note');
  });

  it('joins multiple present notes with a space, skipping undefined', () => {
    expect(combineNotes('first', undefined, 'second')).toBe('first second');
  });
});
