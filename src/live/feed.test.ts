import { describe, expect, it } from 'vitest';
import { appendToFeed, BUILT_IN, gameHistory, kindsBetween, pendingFor, planApply, shellPending, tuningHash } from './feed';
import type { LiveFeed, LiveGameEntry, LiveVersion } from './types';
import { FEED_MAX } from './types';

const g = (o: Partial<LiveGameEntry> = {}): LiveGameEntry => ({ entry: 'assets/game-td.js', sim: 's1', render: 'r1', tuning: 't1', snapshot: 1, ...o });
const v = (sha: string, td: Partial<LiveGameEntry> = {}, shell = 'sh1', other: Partial<LiveGameEntry> = {}): LiveVersion =>
  ({ sha, short: sha.slice(0, 7), message: `commit ${sha}`, time: 0, base: `https://${sha}.example/`, shell, games: { td: g(td), dungeon: g(other) } });

describe('feed', () => {
  it('appends, replaces the same sha and keeps the newest FEED_MAX', () => {
    let f: LiveFeed = { versions: [] };
    for (let i = 0; i < FEED_MAX + 5; i++) f = appendToFeed(f, v(`v${i}`));
    expect(f.versions).toHaveLength(FEED_MAX);
    expect(f.versions[f.versions.length - 1].sha).toBe(`v${FEED_MAX + 4}`);
    f = appendToFeed(f, { ...v('v10'), message: 'again' });
    expect(f.versions.filter((x) => x.sha === 'v10')).toHaveLength(1);
    expect(f.versions[f.versions.length - 1].message).toBe('again');
  });

  it('hashes tunables by value, not key order', () => {
    expect(tuningHash({ a: { d: 1 }, b: { d: true } })).toBe(tuningHash({ b: { d: true }, a: { d: 1 } }));
    expect(tuningHash({ a: { d: 1 } })).not.toBe(tuningHash({ a: { d: 2 } }));
    expect(tuningHash({ a: { d: 1, max: 5 } })).not.toBe(tuningHash({ a: { d: 1, max: 6 } }));
  });

  it('names the kinds of change between two versions of a game', () => {
    expect([...kindsBetween('td', v('a'), v('b', { tuning: 't2' }))]).toEqual(['tuning']);
    expect([...kindsBetween('td', v('a'), v('b', { render: 'r2', sim: 's2' }))].sort()).toEqual(['art', 'logic']);
    expect([...kindsBetween('td', v('a'), v('b', {}, 'sh2'))]).toEqual(['shell']);
    expect(kindsBetween('td', null, v('b')).size).toBe(3);
  });

  it("lists only the versions that touched a game", () => {
    const feed = { versions: [v('a'), v('b', {}, 'sh1', { sim: 'x' }), v('c', { render: 'r2' })] };
    expect(gameHistory(feed, 'td').map((h) => h.v.sha)).toEqual(['a', 'c']);
    expect(gameHistory(feed, 'dungeon').map((h) => h.v.sha)).toEqual(['a', 'b', 'c']); // c put dungeon's sim back
  });
});

describe('planApply', () => {
  const feed = { versions: [v('base'), v('tune', { tuning: 't2' }), v('art', { tuning: 't2', render: 'r2' }), v('logic', { tuning: 't2', render: 'r2', sim: 's2' }), v('fmt', { tuning: 't2', render: 'r3', sim: 's3', snapshot: 2 })] };
  const at = (sha: string) => feed.versions.find((x) => x.sha === sha)!;

  it('applies a tuning-only change live and pins tuning', () => {
    const p = planApply(feed, 'td', BUILT_IN, 'base', at('tune'));
    expect(p).toMatchObject({ tuningNow: true, renderNow: false, simNextStart: false, next: { sim: null, render: null, tuning: 'tune' } });
  });

  it('swaps art live when the snapshot format matches', () => {
    const p = planApply(feed, 'td', BUILT_IN, 'base', at('art'));
    expect(p).toMatchObject({ tuningNow: true, renderNow: true, simNextStart: false, next: { render: 'art', tuning: 'art' } });
  });

  it('queues a logic change for the next start, or skips it', () => {
    const all = planApply(feed, 'td', BUILT_IN, 'base', at('logic'));
    expect(all).toMatchObject({ simNextStart: true, renderNow: true, next: { sim: 'logic', render: 'logic', tuning: 'logic' } });
    const skip = planApply(feed, 'td', BUILT_IN, 'base', at('logic'), { skipLogic: true });
    expect(skip).toMatchObject({ simNextStart: false, renderNow: true, next: { sim: null, render: 'logic' } });
  });

  it("holds a renderer that can't draw the running sim's snapshots", () => {
    const skip = planApply(feed, 'td', BUILT_IN, 'base', at('fmt'), { skipLogic: true });
    expect(skip).toMatchObject({ renderNow: false, renderWaitsForSim: true, next: { sim: null, render: null, tuning: 'fmt' } });
    const all = planApply(feed, 'td', BUILT_IN, 'base', at('fmt'));
    expect(all).toMatchObject({ renderNow: false, renderWaitsForSim: true, simNextStart: true, next: { sim: 'fmt', render: 'fmt' } });
  });

  it('rolls back to the built-in copy', () => {
    const pins = { sim: 'logic', render: 'art', tuning: 'tune' };
    const p = planApply(feed, 'td', pins, 'base', null, { liveSim: 'logic' });
    expect(p).toMatchObject({ simNextStart: true, renderNow: true, tuningNow: true, next: BUILT_IN });
  });

  it('counts what is pending and honours a skipped logic change', () => {
    expect(pendingFor(feed, 'td', BUILT_IN, 'base', null).map((h) => h.v.sha)).toEqual(['fmt', 'logic', 'art', 'tune']);
    const four = { versions: feed.versions.slice(0, 4) };
    expect(pendingFor(four, 'td', { sim: null, render: 'art', tuning: 'art' }, 'base', null).map((h) => h.v.sha)).toEqual(['logic']);
    // took 'logic' without its logic change: nothing left to offer until something newer lands
    expect(pendingFor(four, 'td', { sim: null, render: 'logic', tuning: 'art' }, 'base', 's2')).toEqual([]);
  });

  it('flags an app (shell) update newer than the running build', () => {
    expect(shellPending({ versions: [v('base'), v('new', {}, 'sh2')] }, 'base').map((x) => x.sha)).toEqual(['new']);
    expect(shellPending({ versions: [v('base'), v('new')] }, 'base')).toEqual([]);
    expect(shellPending({ versions: [v('new', {}, 'sh2')] }, 'unknown')).toEqual([]);
  });
});
