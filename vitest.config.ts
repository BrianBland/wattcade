import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'node', // use `// @vitest-environment jsdom` per-file where DOM is needed
    passWithNoTests: true,
    // Many suites run real game/analysis simulations that take 2-8 s locally and
    // 2-3x longer on shared CI runners when files run in parallel. The 5 s default
    // made CI fail on whichever sim happened to land on a slow worker (Lighthouse
    // storm sim on main, earlier qa.sanity/analysis). Very long sims still set
    // their own larger per-test timeouts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
