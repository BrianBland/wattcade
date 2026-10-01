import type { ComponentChildren } from 'preact';
import type { LevelView } from '../types';
import { zoneFractions } from '../format';

export function Btn(p: { children: ComponentChildren; onClick: () => void; primary?: boolean; focused?: boolean; small?: boolean; disabled?: boolean }) {
  return <button class={`btn${p.primary ? ' primary' : ''}${p.focused ? ' focused' : ''}${p.small ? ' small' : ''}`} disabled={p.disabled} onClick={p.onClick}>{p.children}</button>;
}
export function Dot({ on }: { on: boolean }) { return <span class={`dot${on ? ' on' : ''}`} />; }
export function Avatar({ color }: { color: string }) { return <span class="avatar" style={{ background: color, color }} />; }
export function XpBar({ lv }: { lv: LevelView }) {
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
export function Stat({ label, value }: { label: string; value: string }) {
  return <div class="stat"><span class="dim">{label}</span><b>{value}</b></div>;
}
