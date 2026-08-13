// fahsai-client casts the parsed JSON straight to T with no runtime check — every handler
// reading an array field off an unvalidated response body guards it through this instead of
// trusting the cast, so a malformed/renamed/missing field degrades to empty rather than
// throwing downstream.
export function asArray<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [];
}
