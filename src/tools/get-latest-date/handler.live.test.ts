import { describe, expect, it } from 'vitest';

import { createFahsaiClient } from '../../shared/fahsai-client/client.js';
import type { LatestDateApiResponse } from './handler.js';

describe('/api/latest-date (live)', () => {
  it('returns a bare { date } matching YYYY-MM-DD', async () => {
    const client = createFahsaiClient();

    const result = await client.get<LatestDateApiResponse>('/api/latest-date');

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected a successful response');
    expect(result.value.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
