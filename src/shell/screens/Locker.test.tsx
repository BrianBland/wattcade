// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testProfile } from '../../core/testProfile';
import { Locker } from './Locker';
import { migrateCosmetics } from '../../cosmetics/migrate';
const mocks = vi.hoisted(() => ({ equip: vi.fn(), press: null as null | ((s: Set<string>) => void) }));
vi.mock('../services', async () => {
  const { pendingPicks } = await import('../../cosmetics/unlocks');
  return { pendingPicks, equipItem: mocks.equip, itemHint: () => 'Reach the required level' };
});
vi.mock('../menuInput', () => ({ onMenuPress: (f: typeof mocks.press) => { mocks.press = f; return () => { mocks.press = null; }; } }));
vi.mock('../../audio/sfx', () => ({ play: vi.fn() }));
vi.mock('../components/RiderAvatar', () => ({
  ItemArt: ({ it, size, class: cls }: any) => <span data-size={size} class={cls}>{it.id}</span>,
  RiderAvatar: ({ look }: any) => <span data-preview={look.bike} />,
}));
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div'); document.body.append(host);
  Element.prototype.scrollIntoView = vi.fn(); mocks.equip.mockReset();
});
afterEach(() => { act(() => render(null, host)); host.remove(); });
it('locks tiles against pointer and keyboard focus without changing the preview', () => {
  act(() => render(<Locker profile={testProfile()} onProfile={vi.fn()} onPick={vi.fn()} onBack={vi.fn()} />, host));
  const locked = host.querySelector<HTMLButtonElement>('[aria-label="BMX, locked"]')!;
  expect(locked.disabled).toBe(true);
  expect(locked.querySelector('.locked-art')).not.toBeNull();
  expect(host.querySelector('.item-tile:not(.locked) .locked-art')).toBeNull();
  expect(locked.classList.contains('locked')).toBe(true);
  expect(locked.textContent).toContain('🔒 Locked');
  act(() => { locked.click(); locked.focus(); });
  expect(document.activeElement).not.toBe(locked);
  expect(host.querySelector('[data-preview]')?.getAttribute('data-preview')).toBe('road');
  expect(host.querySelector('.locker-focus')).toBeNull();
  expect(mocks.equip).not.toHaveBeenCalled();
});
it('controller skips locked bikes and still equips an unlocked bike', async () => {
  const profile = testProfile({ achievements: ['arcade_rat'] });
  mocks.equip.mockResolvedValue(profile);
  act(() => render(<Locker profile={profile} onProfile={vi.fn()} onPick={vi.fn()} onBack={vi.fn()} />, host));
  act(() => { mocks.press?.(new Set(['down'])); });
  act(() => { mocks.press?.(new Set(['down'])); });
  act(() => mocks.press?.(new Set(['down'])));
  expect(host.querySelector('.item-tile.focused')?.textContent).toContain('Road Bike');
  act(() => mocks.press?.(new Set(['right'])));
  expect(host.querySelector('.item-tile.focused')?.textContent).toContain('Light Cycle');
  expect(host.querySelector('[data-preview]')?.getAttribute('data-preview')).toBe('tron');
  await act(() => mocks.press?.(new Set(['a'])));
  expect(mocks.equip).toHaveBeenCalledWith(profile, 'bike', 'tron');
  expect(host.querySelector('.locked.focused')).toBeNull();
});

it('places unlocked items above the divider and locked items below it', () => {
  act(() => render(<Locker profile={testProfile({ achievements: ['arcade_rat'] })} onProfile={vi.fn()} onPick={vi.fn()} onBack={vi.fn()} />, host));
  const children = Array.from(host.querySelector('.item-grid')!.children);
  const divider = children.findIndex((el) => el.getAttribute('role') === 'separator');
  expect(divider).toBe(2);
  expect(children.slice(0, divider).every((el) => !(el as HTMLButtonElement).disabled)).toBe(true);
  expect(children.slice(divider + 1).every((el) => (el as HTMLButtonElement).disabled)).toBe(true);
  expect(children[1].textContent).toContain('Light Cycle');
  act(() => mocks.press?.(new Set(['down'])));
  act(() => mocks.press?.(new Set(['down'])));
  act(() => mocks.press?.(new Set(['down'])));
  expect(host.querySelector('.locked.focused')).toBeNull();
  expect(host.querySelector('.item-tile.focused')?.textContent).toContain('Road Bike');
});

it('groups the new slots, equips a tutu, and keeps ships out of the shared Locker', async () => {
  const profile=testProfile({level:40,cosmetics:{rotation:1}});
  mocks.equip.mockResolvedValue(profile);
  act(()=>render(<Locker profile={profile} onProfile={vi.fn()} onPick={vi.fn()} onBack={vi.fn()}/>,host));
  const button=(text:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!;
  act(()=>button('Rider').click());
  expect(host.textContent).toContain('Eyewear');expect(host.textContent).toContain('Bottoms');expect(host.textContent).toContain('Feet');
  expect(host.textContent).not.toContain('Ships');
  act(()=>button('Bottoms').click());
  await act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Tutu, unlocked"]')!.click());
  expect(mocks.equip).toHaveBeenCalledWith(profile,'bottoms','w_tutu');
});

it('offers only previously owned archived items in the Legacy collection', () => {
  const profile=migrateCosmetics(testProfile({level:3}));
  act(()=>render(<Locker profile={profile} onProfile={vi.fn()} onPick={vi.fn()} onBack={vi.fn()}/>,host));
  const click=(text:string)=>act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!.click());
  click('Rider');click('Helmets & hats');
  expect(host.querySelector('[aria-label="Beanie, unlocked"]')).toBeNull();
  click('View owned legacy items');
  expect(host.querySelector('[aria-label="Beanie, unlocked"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="Pirate Hat, locked"]')).toBeNull();
});
