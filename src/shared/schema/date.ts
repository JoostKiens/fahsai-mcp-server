import { z } from 'zod';

// Shared by every tool that takes a YYYY-MM-DD date (get_fires, get_fires_range,
// get_station_readings, ...) — never hand-roll a duplicate regex per tool.
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be in YYYY-MM-DD format');
