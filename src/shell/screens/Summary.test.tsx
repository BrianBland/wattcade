// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import { defaultProfile } from '../../progression';
import type { SessionRecord } from '../../contracts';
import { deliverMenuPresses } from '../menuInput';
vi.mock('../components/ui', async original => ({
  ...(await original<typeof import('../components/ui')>()),
  CountUp: ({
    to
  }: {
    to: number;
  }) => <span>{to}</span>
}));
import { Summary } from './Summary';
it('lets a controller scroll long ride details while keeping the rewards continuation action', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div'),
    onDone = vi.fn();
  document.body.append(host);
  const record: SessionRecord = {
    id: 'ride',
    profileId: 'rider',
    gameId: 'warmup',
    startedAt: 0,
    durationS: 1200,
    samples: [],
    events: [],
    stats: {
      avgPower: 180,
      maxPower: 300,
      kj: 216,
      avgHr: 140,
      zoneSeconds: [0, 900, 300, 0, 0],
      sprints: 2
    },
    gameSummary: {
      distanceKm: 9
    }
  };
  try {
    await act(() => render(<Summary record={record} award={{
      xpGained: 100,
      levelBefore: 1,
      levelAfter: 1,
      newAchievements: [],
      newItems: [],
      picks: 1
    }} xpAfter={100} ftp={200} profile={defaultProfile('Mika')} onDone={onDone} />, host));
    const scroller = host.querySelector<HTMLElement>('.summary')!,
      scroll = vi.fn();
    scroller.scrollBy = scroll;
    Object.defineProperty(scroller, 'clientHeight', {
      value: 600
    });
    await act(() => deliverMenuPresses(new Set(['down'])));
    expect(scroll).toHaveBeenCalledWith({
      top: 360,
      behavior: 'smooth'
    });
    await act(() => deliverMenuPresses(new Set(['up'])));
    expect(scroll).toHaveBeenCalledWith({
      top: -360,
      behavior: 'smooth'
    });
    const button = host.querySelector<HTMLButtonElement>('.screen-head .primary')!;
    expect(button.textContent).toContain('Choose reward');
    await act(() => button.click());
    expect(onDone).toHaveBeenCalledOnce();
  } finally {
    await act(() => render(null, host));
    host.remove();
    vi.useRealTimers();
  }
});
