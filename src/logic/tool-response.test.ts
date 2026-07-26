import { describe, expect, it } from 'vitest';

import { buildToolError, buildToolResponse, combineNotes } from './tool-response.js';

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

describe('buildToolResponse', () => {
  it('omits the note field when there is none', () => {
    const result = buildToolResponse({ total: 0 });

    expect(result.structuredContent).toEqual({ total: 0 });
    expect(result.isError).toBeUndefined();
  });

  it("combines extra notes with the summary's own note", () => {
    const result = buildToolResponse({ total: 1, note: "summary's note" }, 'extra note');

    expect(result.structuredContent).toEqual({ total: 1, note: "extra note summary's note" });
  });

  it('serializes structuredContent as the text content', () => {
    const result = buildToolResponse({ total: 2 });

    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({ total: 2 }) }]);
  });
});

describe('buildToolError', () => {
  it('sets isError and puts the message in content', () => {
    const result = buildToolError('something went wrong');

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'something went wrong' }]);
    expect(result.structuredContent).toBeUndefined();
  });
});
