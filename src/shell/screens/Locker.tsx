import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { itemsIn } from '../../cosmetics/catalog';
import { isUnlocked, loadout, nextReward, riderLook, titleOf, withItem } from '../../cosmetics/unlocks';
import { SLOTS, SLOT_NAMES, type Item } from '../../cosmetics/types';
import { Btn } from '../components/Bits';
import { KeyHints } from '../components/ui';
import { ItemArt, RiderAvatar } from '../components/RiderAvatar';
import { equipItem, itemHint, pendingPicks } from '../services';
import { useMenuNav } from '../useMenuNav';
import { play } from '../../audio/sfx';

const COLS = 5;

/** Locker: the rider on the left (previews only unlocked items), slot tabs and item tiles on the right. */
export function Locker({ profile, onProfile, onPick, onBack }: { profile: Profile; onProfile: (p: Profile) => void; onPick: () => void; onBack: () => void }) {
  const [tab, setTab] = useState(0);
  const slot = SLOTS[tab], catalog = itemsIn(slot), worn = loadout(profile);
  const unlocked = catalog.filter((it) => isUnlocked(profile, it));
  const locked = catalog.filter((it) => !isUnlocked(profile, it));
  const items = [...unlocked, ...locked];
  const itemRows = (count: number) => Array.from({ length: Math.ceil(count / COLS) }, (_, r) => Math.min(COLS, count - r * COLS));
  const picks = pendingPicks(profile).length;
  const head = picks ? 1 : 0;                          // the "choose your reward" button row
  const rows = [...(head ? [1] : []), SLOTS.length, ...itemRows(unlocked.length), ...itemRows(locked.length)];
  const tabStart = head, gridStart = head + SLOTS.length;
  const select = async (i: number) => {
    if (head && i === 0) return onPick();
    if (i < gridStart) { setTab(i - tabStart); return; }
    const it = items[i - gridStart];
    if (!it || !isUnlocked(profile, it)) { play('deny'); return; }
    onProfile(await equipItem(profile, slot, it.id));
  };
  const [idx, setIdx] = useMenuNav(gridStart + items.length, rows, (i) => void select(i), onBack, true, { initial: tabStart, isDisabled: (i) => i >= gridStart && (!items[i - gridStart] || !isUnlocked(profile, items[i - gridStart])) });
  // moving along the tabs switches the tab
  useEffect(() => { if (idx >= tabStart && idx < gridStart) setTab(idx - tabStart); }, [idx]);
  const grid = useRef<HTMLDivElement>(null);
  useEffect(() => { grid.current?.querySelector('.focused')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [idx, tab]);

  const base = riderLook(profile);
  const candidate = idx >= gridStart ? items[idx - gridStart] : undefined;
  const focusItem: Item | undefined = candidate && isUnlocked(profile, candidate) ? candidate : undefined;
  const preview = focusItem ? withItem(base, focusItem) : base;
  const title = focusItem?.slot === 'title' ? (focusItem.id === 'none' ? null : focusItem.name) : titleOf(profile);
  const next = nextReward(profile);
  const owned = unlocked.length;
  return (
    <div class="screen locker cosmetic-ui">
      <div class="screen-head">
        <div><h1>Locker</h1><div class="sub">Level {profile.level} · {SLOT_NAMES[slot]} {owned}/{items.length} unlocked</div></div>
        <span class="spacer" />
        <Btn onClick={onBack}>Back</Btn>
      </div>
      <div class="locker-grid">
        <div class="panel locker-hero">
          {focusItem?.slot === 'ship' ? <ItemArt it={focusItem} base={base} size="hero" /> : <RiderAvatar look={preview} size="hero" />}
          <h3>{profile.name}</h3>
          {title && <div class="rider-title">{title}</div>}
          {focusItem && <div class="locker-focus">
            <b>{focusItem.name}</b>{worn[slot] === focusItem.id ? <span class="good">✓ Equipped</span> : <span class="dim">A to equip</span>}
            {focusItem.flavor && <div class="dim small">{focusItem.flavor}</div>}
          </div>}
          {next && <div class="dim small">Next reward at level {next.level}: {next.pick ? `pick one of ${next.items.map((i) => i.name).join(', ')}` : next.items.map((i) => i.name).join(', ')}</div>}
          {head > 0 && <Btn primary focused={idx === 0} onClick={onPick}>🎁 Choose your reward{picks > 1 ? ` (${picks})` : ''}</Btn>}
        </div>
        <div class="panel locker-items">
          <div class="row tabs">{SLOTS.map((s, i) => <Btn small focused={idx === tabStart + i} class={tab === i ? 'on' : ''} onClick={() => { setTab(i); setIdx(tabStart + i); }}>{SLOT_NAMES[s]}</Btn>)}</div>
          <div class="item-grid" ref={grid} key={slot}>
            {items.map((it, i) => {
              const un = isUnlocked(profile, it), on = worn[slot] === it.id, f = un && idx === gridStart + i;
              return (
                <Fragment key={it.id}>
                  {i === owned && <div class="locker-divider" role="separator" aria-label="Locked items"><span>Locked</span></div>}
                  <button type="button" disabled={!un} aria-label={`${it.name}${!un ? ', locked' : on ? ', equipped' : ''}`} class={`card item-tile${f ? ' focused' : ''}${un ? '' : ' locked'}${on ? ' on' : ''}`} onFocus={() => setIdx(gridStart + i)} onKeyDown={e => {if(e.key==='Enter')e.stopPropagation();}} onClick={() => { setIdx(gridStart + i); void select(gridStart + i); }}>
                    {it.slot === 'title' ? <div class={`title-tile${!un ? ' locked-art' : ''}`}>{it.id === 'none' ? '—' : it.name}</div> : <ItemArt it={it} base={base} size="thumb" still lazy road={false} class={!un ? 'locked-art' : ''} />}
                    <div class="item-name">{it.name}</div>
                    <div class="item-status">{!un ? '🔒 Locked' : on ? '✓ Equipped' : '✓ Unlocked'}</div>
                    {!un && <div class="item-hint">{itemHint(it)}</div>}
                  </button>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
      <KeyHints hints={[['dpad', 'Browse'], ['a', 'Equip'], ['b', 'Back']]} />
    </div>
  );
}
