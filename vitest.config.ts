import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { relative } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import timings from './scripts/ci/test-timings.json' with { type: 'json' };

/**
 * Order only. Every specification is retained, including files with no hint.
 * Vitest already sorts by its own results cache; these hints cover a cold cache,
 * where the long Watershed scenario files are tiny and would otherwise start last.
 * Worker count stays at Vitest's default (cpus - 1). A 2-CPU pair that forced
 * 100% measured 1 worker against 2, which is not the 4-CPU hosted runner.
 */
export class LongestFirstSequencer extends BaseSequencer {
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const ordered = await super.sort(files);
    const hints = timings.files as Record<string, number>;
    const estimate = (spec: TestSpecification) => {
      const path = relative(this.ctx.config.root, spec.moduleId).replaceAll('\\', '/');
      const cached = this.ctx.cache.getFileTestResults(`${spec.project.name}:${path}`);
      return {
        failed: cached?.failed ?? false,
        duration: cached?.duration ?? hints[path] ?? 0,
      };
    };
    let group = 0;
    const estimates = new Map(ordered.map((spec, index) => {
      // Keep the contiguous project boundaries BaseSequencer already established.
      if (index && spec.project !== ordered[index - 1].project) group++;
      return [spec, { ...estimate(spec), group }] as const;
    }));
    return ordered.sort((a, b) => {
      const x = estimates.get(a)!, y = estimates.get(b)!;
      return x.group - y.group || Number(y.failed) - Number(x.failed) || y.duration - x.duration;
    });
  }
}

export default defineConfig({
  plugins: [preact()],
  test: {
    sequence: { sequencer: LongestFirstSequencer },
    environment: 'node', // use `// @vitest-environment jsdom` per-file where DOM is needed
    passWithNoTests: true,
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
