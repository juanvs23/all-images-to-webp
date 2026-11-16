import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Each suite creates its own temporary fixtures; no shared state to isolate.
    pool: 'forks',
  },
});
