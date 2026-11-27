// After a live publish: from a page on another origin (the live alias, like the prod page is), read the feed and this
// version's manifest, then import() every game's chunk and its renderer chunk. Fails on CORS, MIME or base-URL problems.
// Usage: tsx scripts/live/smoke.ts <feed URL on another origin> <version base URL>   (needs Chrome; GitHub runners have it)
import { chromium } from 'playwright-core';

const [page0, base] = process.argv.slice(2);
if (!page0 || !base) throw new Error('usage: smoke.ts <page url> <version base url>');

async function main() {
  const browser = await chromium.launch({ channel: process.env.SMOKE_CHROME ? undefined : 'chrome', executablePath: process.env.SMOKE_CHROME || undefined });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(page0, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(async (b: string) => {
      const out: string[] = [];
      const feed = await (await fetch(location.href, { cache: 'no-store' })).json(); // the page is the feed itself
      const m = await (await fetch(`${b}live/manifest.json`)).json();
      if (!feed.versions.some((v: { sha: string }) => v.sha === m.sha)) out.push(`feed doesn't list ${m.short}`);
      for (const [id, g] of Object.entries(m.games as Record<string, { entry: string }>)) {
        try {
          const mod = (await import(/* @vite-ignore */ b + g.entry)).module;
          if (mod?.id !== id) { out.push(`${id}: chunk exports ${mod?.id}`); continue; }
          const r = await mod.loadRenderer();
          if (typeof r?.mount !== 'function') out.push(`${id}: renderer has no mount()`);
        } catch (e) { out.push(`${id}: ${e instanceof Error ? e.message : e}`); }
      }
      return { failures: out, games: Object.keys(m.games).length, versions: feed.versions.length, origin: location.origin };
    }, base);
    console.log(`live smoke: ${result.games} games from ${base} imported on ${result.origin}; feed has ${result.versions} versions`);
    const all = [...result.failures, ...errors.map((e) => `page error: ${e}`)];
    if (all.length) { all.forEach((f) => console.error(`::error title=Live smoke::${f}`)); process.exitCode = 1; }
  } finally { await browser.close(); }
}
void main();
