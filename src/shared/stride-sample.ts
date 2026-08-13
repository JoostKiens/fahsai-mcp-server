// Evenly strides through `items` down to `max` entries rather than truncating to a prefix —
// a straight prefix would only ever show one corner of a spatially/temporally ordered dataset.
export function strideSample<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const stride = items.length / max;
  return Array.from({ length: max }, (_, i) => items[Math.floor(i * stride)]);
}
