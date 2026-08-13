export interface SummarizedValidReadings<TSummary> {
  readonly items: readonly TSummary[];
  readonly note?: string;
}

// Shared "filter out an invalid PM2.5 reading, count what was omitted, note it" loop used by
// every station-shaped-list tool (get_station_readings, get_station_readings_history) — see
// mcp-tools.md's station-list exemption from the project's "no raw large arrays" rule. `noun`
// lets each tool keep its own existing wording ("station reading(s)" vs "reading(s)").
export function summarizeValidReadings<TRaw, TSummary>(
  raw: readonly TRaw[],
  toSummary: (entry: TRaw) => TSummary | null,
  noun = 'reading',
): SummarizedValidReadings<TSummary> {
  const items: TSummary[] = [];
  let omitted = 0;

  for (const entry of raw) {
    const summary = toSummary(entry);
    if (summary === null) {
      omitted += 1;
      continue;
    }
    items.push(summary);
  }

  return {
    items,
    note: omitted > 0 ? `${omitted} ${noun}(s) omitted for an invalid PM2.5 value.` : undefined,
  };
}
