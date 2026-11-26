// Pure helpers for live builds (unit-tested in src/live/build.test.ts).

/**
 * Blank out the default value of every `.num('key', <default>` / `.bool('key', <default>` / `.choice('key', <default>` call,
 * so a commit that only changes tunable defaults hashes the same sim (it is then a tuning change, applied live).
 */
export function normalizeTuningDefaults(code: string): string {
  return code.replace(/\.(num|bool|choice)\(\s*(['"`])([\w.-]+)\2\s*,\s*([^,)]+)/g, (_m, fn, q, key) => `.${fn}(${q}${key}${q}, _`);
}

/** Runtime export names of a module's source (functions and consts; types are erased). */
export function runtimeExports(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  return [...names].sort();
}

/** A module that forwards each export to the page's own copy (globalThis.__wattcadeShared[name]), looked up per call. */
export function sharedForwarder(name: string, exports: string[]): string {
  const host = `const host = () => { const m = globalThis.__wattcadeShared?.[${JSON.stringify(name)}]; if (!m) throw new Error('wattcade live: shared module ${name} is not registered'); return m; };`;
  return [host, ...exports.map((e) => `export function ${e}(...a) { return host().${e}(...a); }`)].join('\n');
}
