import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Joins any present notes (e.g. a location-resolution note plus a summary's own note) with
// a space, skipping `undefined`s.
export function combineNotes(...notes: ReadonlyArray<string | undefined>): string | undefined {
  const present = notes.filter((note): note is string => note !== undefined);
  return present.length > 0 ? present.join(' ') : undefined;
}

// Shared MCP response shaping for any tool whose summary carries an optional `note` —
// success case. Generic over the summary shape so every tool's response builder doesn't
// have to reimplement identical note-combining + structuredContent-shaping logic.
export function buildToolResponse<T extends { readonly note?: string }>(
  summary: T,
  ...extraNotes: ReadonlyArray<string | undefined>
): CallToolResult {
  const note = combineNotes(...extraNotes, summary.note);
  const structuredContent: Record<string, unknown> = note ? { ...summary, note } : { ...summary };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

// Shared MCP response shaping — error case.
export function buildToolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
