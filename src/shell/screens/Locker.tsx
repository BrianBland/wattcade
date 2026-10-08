import { useEffect, useRef, useState } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { itemsIn } from '../../cosmetics/catalog';
import { isUnlocked, loadout, nextReward, riderLook, titleOf, withItem } from '../../cosmetics/unlocks';
import { SLOTS, SLOT_NAMES, type Item } from '../../cosmetics/types';
import { Btn } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { RiderAvatar } from '../components/RiderAvatar';
import { equipItem, itemHint, pendingPicks } from '../services';
import { useMenuNav } from '../useMenuNav';
import { play } from '../../audio/sfx';

const COLS = 5;

/** Locker: the rider on the left (previews whatever tile is focused), slot tabs and item tiles on the right. */
export function Locker({ profile, onProfile, onPick, onBack }: { profile: Profile; onProfile: (p: Profile) => void; onPick: () => void; onBack: () => void }) {
  const [tab, setTab] = useState(0);
  const slot = SLOTS[tab], items = itemsIn(slot), worn = loadout(profile);
  const picks = pendingPicks(profile).length;
  const head = picks ? 1 : 0;                          // the "choose your reward" button row
  const rows = [...(head ? [1] : []), SLOTS.length, ...Array.from({ length: Math.ceil(items.length / COLS) }, (_, r) => Math.min(COLS, items.length - r * COLS))];
  const tabStart = head, gridStart = head + SLOTS.length;
  const select = async (i: number) => {
    if (head && i === 0) return onPick();
    if (i < gridStart) { setTab(i - tabStart); return; }
    const it = items[i - gridStart];
    if (!isUnlocked(profile, it)) { play('deny'); return; }
    onProfile(await equipItem(profile, slot, it.id));
  };
  const [idx, setIdx] = useMenuNav(gridStart + items.length, rows, (i) => void select(i), onBack, true, { initial: tabStart });
  // moving along the tabs switches the tab
  useEffect(() => { if (idx >= tabStart && idx < gridStart) setTab(idx - tabStart); }, [idx]);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { grid.current?.querySelector('.focused')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [idx, tab]);

  const base = riderLook(profile);
  const focusItem: Item | undefined = idx >= gridStart ? items[idx - gridStart] : undefined;
  const preview = focusItem ? withItem(base, focusItem) : base;
  const locked = focusItem && !isUnlocked(profile, focusItem);
  const title = focusItem?.slot === 'title' ? (focusItem.id === 'none' ? null : focusItem.name) : titleOf(profile);
  const next = nextReward(profile);
  const owned = items.filter((it) => isUnlocked(profile, it)).length;
  return (
    <div class="screen locker">
      <div class="screen-head">
        <div><h1>Locker</h1><div class="sub">Level {profile.level} · {SLOT_NAMES[slot]} {owned}/{items.length}</div></div>
        <span class="spacer" />
        <Btn onClick={onBack}>Back</Btn>
      </div>
      <div class="locker-grid">
        <div class="panel locker-hero">
          <RiderAvatar look={preview} size="hero" />
          <h3>{profile.name}</h3>
          {title && <div class="rider-title">{title}</div>}
          {focusItem && <div class="locker-focus">
            <b>{focusItem.name}</b>{locked ? <span class="lock">🔒 {itemHint(focusItem)}</span> : worn[slot] === focusItem.id ? <span class="good">✓ Equipped</span> : <span class="dim">A to equip</span>}
            {focusItem.flavor && <div class="dim small">{focusItem.flavor}</div>}
          </div>}
          {next && <div class="dim small">Next reward at level {next.level}: {next.pick ? `pick one of ${next.items.map((i) => i.name).join(', ')}` : next.items.map((i) => i.name).join(', ')}</div>}
          {head > 0 && <Btn primary focused={idx === 0} onClick={onPick}>🎁 Choose your reward{picks > 1 ? ` (${picks})` : ''}</Btn>}
        </div>
        <div class="panel locker-items">
          <div class="row tabs">{SLOTS.map((s, i) => <Btn small focused={idx === tabStart + i} class={tab === i ? 'on' : ''} onClick={() => { setTab(i); setIdx(tabStart + i); }}>{SLOT_NAMES[s]}</Btn>)}</div>
          <div class="item-grid" ref={grid}>
            {items.map((it, i) => {
              const un = isUnlocked(profile, it), on = worn[slot] === it.id, f = idx === gridStart + i;
              return (
                <div class={`card item-tile${f ? ' focused' : ''}${un ? '' : ' locked'}${on ? ' on' : ''}`} onClick={() => { setIdx(gridStart + i); void select(gridStart + i); }}>
                  {it.slot === 'title' ? <div class="title-tile">{it.id === 'none' ? '—' : it.name}</div> : <RiderAvatar look={withItem(base, it)} size="thumb" still road={false} silhouette={!un} />}
                  <div class="item-name">{un ? it.name : '🔒'}</div>
                  {!un && <div class="item-hint">{itemHint(it)}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <KeyHints hints={[['dpad', 'Browse'], ['a', 'Equip'], ['b', 'Back']]} />
    </div>
  );
}
