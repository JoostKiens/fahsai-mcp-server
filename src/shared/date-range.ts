import type { Result } from './result.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseUtcDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // JS silently rolls over out-of-range days/months (e.g. "2026-02-30" -> March 2) instead
  // of rejecting them — round-trip through ISO to catch that instead of trusting getTime().
  return date.toISOString().slice(0, 10) === value ? date : null;
}

export interface DateRangeCheck {
  readonly days: number;
}

// Cross-field date-range validation the MCP SDK's per-field inputSchema can't express, shared
// by every tool with a client-enforced day-count cap (get_fires_range, get_cams_summary) —
// extracted from shared/fires/handler.ts once a second real consumer needed the identical
// date-parsing edge cases (JOO-35). Runs before any network call.
export function validateDateRange(
  start: string,
  end: string,
  maxDays: number,
  toolName: string,
): Result<DateRangeCheck, string> {
  const startDate = parseUtcDate(start);
  if (startDate === null) {
    return { ok: false, error: `"${start}" is not a valid calendar date.` };
  }

  const endDate = parseUtcDate(end);
  if (endDate === null) {
    return { ok: false, error: `"${end}" is not a valid calendar date.` };
  }

  if (endDate.getTime() < startDate.getTime()) {
    return { ok: false, error: '`end` must not be before `start`.' };
  }

  const days = Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
  if (days > maxDays) {
    return {
      ok: false,
      error: `Date range spans ${days} days; ${toolName} allows a maximum of ${maxDays} days. Narrow the range and try again.`,
    };
  }

  return { ok: true, value: { days } };
}
