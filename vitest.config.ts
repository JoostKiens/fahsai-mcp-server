import { configDefaults, defineConfig } from 'vitest/config';

// `npm run test:live` sets LIVE=true to flip this to *only* the live-network tests — the
// default `npm test` must never touch the network, so the two modes are mutually exclusive.
const live = process.env.LIVE === 'true';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    include: live ? ['**/*.live.test.ts'] : configDefaults.include,
    exclude: live ? configDefaults.exclude : [...configDefaults.exclude, '**/*.live.test.ts'],
  },
});
