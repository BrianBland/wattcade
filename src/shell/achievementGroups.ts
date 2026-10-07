import type { AchievementView } from './types';

/** Achievements under headings: "Everywhere" first, then each game in registry order (the input order). */
export function groupAchievements(list: readonly AchievementView[]): Array<{ title: string; items: AchievementView[]; done: number }> {
  const groups: Array<{ title: string; items: AchievementView[]; done: number }> = [];
  for (const a of list) {
    let g = groups.find((x) => x.title === a.group);
    if (!g) groups.push(g = { title: a.group, items: [], done: 0 });
    g.items.push(a);
    if (a.unlocked) g.done++;
  }
  return groups.sort((x, y) => Number(y.title === 'Everywhere') - Number(x.title === 'Everywhere'));
}

/** The locked goal achievements nearest completion (some progress, not secret), most complete first. */
export function closestGoals(list: readonly AchievementView[], n: number): AchievementView[] {
  return list.filter((a) => !a.unlocked && !a.secret && a.progress && a.progress.frac > 0)
    .sort((x, y) => y.progress!.frac - x.progress!.frac).slice(0, n);
}
