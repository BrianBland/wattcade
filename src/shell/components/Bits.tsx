import type { ComponentChildren } from 'preact';
import type { LevelView } from '../types';
import { zoneFractions } from '../format';
import { play } from '../../audio/sfx';

export function Btn(p: { children: ComponentChildren; onClick: () => void; primary?: boolean; focused?: boolean; small?: boolean; disabled?: boolean; class?: string }) {
  return (
    <button type="button" class={`btn${p.primary ? ' primary' : ''}${p.focused ? ' focused' : ''}${p.small ? ' small' : ''}${p.class ? ` ${p.class}` : ''}`}
      disabled={p.disabled} onClick={(e) => { e.stopPropagation(); play('uiSelect'); p.onClick(); }}>{p.children}</button>
  );
}
export function Dot({ on, busy }: { on: boolean; busy?: boolean }) { return <span class={`dot${on ? ' on' : ''}${busy ? ' busy' : ''}`} />; }
export function Avatar({ color, big }: { color: string; big?: boolean }) { return <span class={`avatar${big ? ' big' : ''}`} style={{ background: color, color }} />; }
export function XpBar({ lv, compact }: { lv: LevelView; compact?: boolean }) {
  if (compact) {
    return (
      <div class="xp compact">
        <b>Lv {lv.level}</b>
        <div class="bar"><i style={{ width: `${lv.progress * 100}%` }} /></div>
        <span class="dim">{Math.round(lv.xp)} / {lv.nextXp} XP</span>
      </div>
    );
  }
  return (
    <div>
      <div class="row"><b>Level {lv.level}</b><span class="spacer" /><span class="dim">{Math.round(lv.xp)} / {lv.nextXp} XP</span></div>
      <div class="bar"><i style={{ width: `${lv.progress * 100}%` }} /></div>
    </div>
  );
}
export function ZoneBar({ zoneSeconds }: { zoneSeconds: number[] }) {
  const f = zoneFractions(zoneSeconds);
  return <div class="bar zone-bar" style={{ height: '22px' }}>{f.map((x, i) => <i key={i} class={`z${Math.min(i + 1, 5)}`} style={{ width: `${x * 100}%` }} title={`Z${i + 1}`} />)}</div>;
}
export function Stat({ label, value, delayMs = 0 }: { label: string; value: ComponentChildren; delayMs?: number }) {
  return <div class="stat" style={{ animationDelay: `${delayMs}ms` }}><span class="dim">{label}</span><b>{value}</b></div>;
}
