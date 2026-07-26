// Joins any present notes (e.g. a location-resolution note plus a summary's own note) with
// a space, skipping `undefined`s — shared across tool response builders.
export function combineNotes(...notes: ReadonlyArray<string | undefined>): string | undefined {
  const present = notes.filter((note): note is string => note !== undefined);
  return present.length > 0 ? present.join(' ') : undefined;
}
