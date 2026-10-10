import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// CI runs headless game scenarios only through vitest (`npm run sim:all` is a local tool), so every game
// with a scenarios.ts must have a test file under test/ that imports it.
it('every game scenarios.ts is run by a vitest test', () => {
  const root = join(__dirname);
  const missing: string[] = [];
  for (const id of readdirSync(root)) {
    if (!existsSync(join(root, id, 'scenarios.ts'))) continue;
    const dir = join(root, id, 'test');
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.tsx?$/.test(f)) : [];
    if (!files.some((f) => /from '\.\.\/scenarios'/.test(readFileSync(join(dir, f), 'utf8')))) missing.push(id);
  }
  expect(missing).toEqual([]);
});
