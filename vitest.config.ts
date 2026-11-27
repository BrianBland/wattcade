import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import timings from './scripts/ci/test-timings.json' with { type: 'json' };

/** Order only: every specification, including unknown/new tests, is retained. */
export class LongestFirstSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = await super.sort(files);
    const estimate = (spec: TestSpecification) => {
      const path = relative(this.ctx.config.root, spec.moduleId).replaceAll('\\', '/');
      const cached = this.ctx.cache.getFileTestResults(`${spec.project.name}:${path}`);
      return {
        failed: cached?.failed ?? false,
        duration: cached?.duration ?? (timings.files as Record<string, number>)[path] ?? 0,
      };
    };
    let group = 0;
    const estimates = new Map(ordered.map((spec, index) => {
      // Keep the contiguous execution boundaries established by BaseSequencer.
      if (index && spec.project !== ordered[index - 1].project) group++;
      return [spec, { ...estimate(spec), group }] as const;
    }));
    return ordered.sort((a, b) => {
      const x = estimates.get(a)!, y = estimates.get(b)!;
      // Keep failed-first feedback; use measured cold hints only without history.
      return x.group - y.group || Number(y.failed) - Number(x.failed) || y.duration - x.duration;
    });
  }
}

export default defineConfig({
  plugins: [preact()],
  test: {
    // Use the available CPUs; keep process isolation and the complete inventory.
    maxWorkers: '100%',
    sequence: { sequencer: LongestFirstSequencer },
    environment: 'node', // use `// @vitest-environment jsdom` per-file where DOM is needed
    passWithNoTests: true,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
