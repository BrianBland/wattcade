import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { CARD_SHOTS } from '../src/shell/cards/shots';
import { cardKey, importGraph, relativeImports, type Fs } from './cards-key';

const mem = (files: Record<string, string>): Fs => ({ isFile: (p) => p in files, read: (p) => files[p] });

describe('card clip keys', () => {
  it('finds static, dynamic, side-effect and worker URL imports', () => {
    expect(relativeImports(`import a from './a';\nimport type { B } from "../b";\nexport { c } from './c';\nimport './d.css';\n` +
      `const r = () => import('./render/renderer');\nnew Worker(new URL('./w.ts', import.meta.url));\nimport x from './x.png?url';\nimport y from 'three';`))
      .toEqual(['./a', '../b', './c', './d.css', './render/renderer', './w.ts', './x.png']);
  });
  it('walks the graph, resolving extensions and index files, and stops at skipped files', () => {
    const fs = mem({
      '/g/a/index.ts': `import './sim'; const r = () => import('./render');`,
      '/g/a/sim.ts': `import '../../core';`, '/g/a/render/index.ts': `import '../../b/thing'; import './look.css';`, '/g/a/render/look.css': '',
      '/core/index.ts': '', '/g/b/thing.ts': `import '../../never';`,
    });
    expect(importGraph(['/g/a/index.ts'], (p) => p.startsWith('/g/b/'), fs))
      .toEqual(['/core/index.ts', '/g/a/index.ts', '/g/a/render/index.ts', '/g/a/render/look.css', '/g/a/sim.ts']);
  });
  it('keys each game on its own code and shot', () => {
    const root = join(__dirname, '..');
    const ham = cardKey('hamster', CARD_SHOTS.hamster, root);
    expect(ham).toMatch(/^[0-9a-f]{20}$/);
    expect(cardKey('hamster', CARD_SHOTS.hamster, root)).toBe(ham);
    expect(cardKey('hamster', { ...CARD_SHOTS.hamster, sec: 1 }, root)).not.toBe(ham);
    expect(cardKey('dungeon', CARD_SHOTS.dungeon, root)).not.toBe(ham);
  });
});
