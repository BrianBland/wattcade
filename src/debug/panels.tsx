import type { Button, TrainerCommand } from '../contracts';
import type { DebugActions, DebugSnapshot, TuningEntry } from './types';
import { TrainerTest } from './TrainerTest';
import { formatNum, formatValue } from '../shell/format';
import { Dot } from '../shell/components/Bits';
import { gfxStats } from '../gfx/stats';

const fmtCmd = (c: TrainerCommand): string =>
  c.mode === 'sim' ? `sim ${c.gradePct.toFixed(2)}%` : c.mode === 'erg' ? `erg ${Math.round(c.watts)}W`
  : c.mode === 'resistance' ? `res ${Math.round(c.levelPct)}` : 'none';
const KV = ({ rows }: { rows: Array<[string, string | number]> }) => (
  <div class="kv">{rows.flatMap(([k, v]) => [<span>{k}</span>, <span>{v}</span>])}</div>
);

export function DevicePanel({ s, pps }: { s: DebugSnapshot; pps: Record<string, number> }) {
  const b = s.bike;
  return (
    <div class="panel tl">
      <h4>Devices</h4>
      <div>
        <Dot on={!!b?.connected.trainer} />trn <Dot on={!!b?.connected.hr} />hr <Dot on={!!b?.connected.controller} />ride <Dot on={!!b?.connected.fake} />fake
      </div>
      <KV rows={[
        ['power', b ? formatNum(b.raw.power) : '--'], ['cadence', b ? formatNum(b.raw.cadence) : '--'],
        ['speed', b ? formatNum(b.raw.speedKph, 1) : '--'], ['hr', b ? formatNum(b.raw.hr) : '--'],
        ['resist lvl', b ? formatNum(b.raw.resistanceLevel) : '--'], ['pkt age s', b ? formatNum(b.raw.lastPacketAgeS, 1) : '--'],
        ['pkt/s trn', formatNum(pps.trainer ?? 0, 1)], ['pkt/s hr', formatNum(pps.hr ?? 0, 1)], ['pkt/s ride', formatNum(pps.controller ?? 0, 1)],
        ['ride fw', s.controllerInfo.firmware ?? '--'], ['ride batt', s.controllerInfo.battery == null ? '--' : `${s.controllerInfo.battery}%`],
      ]} />
      {s.trainerDetail && <div style={{ color: 'var(--warn)' }}>trainer: {s.trainerDetail}</div>}
      {s.controllerInfo.warning && <div style={{ color: 'var(--warn)' }}>{s.controllerInfo.warning}</div>}
      {s.stats.controller?.lastStatusHex && ([] as string[]).concat(s.stats.controller.lastStatusHex).map((h, i) => (
        <div class="dim" style={{ wordBreak: 'break-all', maxWidth: '190px' }}>ride{i + 1} raw: {h}</div>
      ))}
    </div>
  );
}

export function DerivedPanel({ s }: { s: DebugSnapshot }) {
  const b = s.bike;
  if (!b) return <div class="panel tr"><h4>Derived</h4>no session</div>;
  const gfx = gfxStats();
  return (
    <div class="panel tr">
      <h4>Derived</h4>
      <KV rows={[
        ['p3s / p10s', `${formatNum(b.power3s)} / ${formatNum(b.power10s)}`], ['cad3s', formatNum(b.cadence3s)], ['hr5s', formatNum(b.hr5s)],
        ['pZone / hrZone', `${b.powerZone} / ${b.hrZone ?? '-'}`], ['effortZone', b.effortZone], ['ftpFrac', formatNum(b.ftpFraction, 2)],
        ['crankRevs', formatNum(b.crankRevs, 1)], ['sprint', `${b.sprinting ? 'YES' : 'no'} (${b.sprintCount})`],
        ['gear', b.gear], ['kJ', formatNum(b.kj, 1)], ['mode', b.trainerMode],
        ['3D', gfx.backend === 'pending' ? '--' : `${gfx.backend} ${formatNum(gfx.fps)} fps`],
      ]} />
    </div>
  );
}

const Paddle = ({ label, raw, v }: { label: string; raw: number; v: number }) => (
  <div>{label} raw {String(Math.round(raw)).padStart(4)} / {v.toFixed(2)}
    <div class="pbar"><i style={{ left: v < 0 ? `${50 + v * 50}%` : '50%', width: `${Math.abs(v) * 50}%` }} /></div></div>
);
const GRID: Array<Array<Button | null>> = [
  ['shiftUpL', 'powerUpL', 'powerUpR', 'shiftUpR'], ['shiftDnL', 'onOffL', 'onOffR', 'shiftDnR'],
  ['up', 'y', 'z', null], ['left', 'right', 'a', 'b'], ['down', null, null, null],
];
export function ControllerPanel({ s }: { s: DebugSnapshot }) {
  const held = new Set<string>([...(s.rawController?.buttons ?? []), ...(s.input?.held ?? [])]);
  return (
    <div class="panel bl">
      <h4>Controller ({s.input?.source ?? '--'})</h4>
      <Paddle label="L" raw={s.rawController?.paddleL ?? 0} v={s.input?.paddleL ?? 0} />
      <Paddle label="R" raw={s.rawController?.paddleR ?? 0} v={s.input?.paddleR ?? 0} />
      <div>idle {formatNum(s.input?.paddleIdleS, 1)}s</div>
      <div class="btngrid">{GRID.flat().map((b) => <span class={b && held.has(b) ? 'on' : ''}>{b ? b.replace('shift', 'sh').replace('power', 'pw') : ''}</span>)}</div>
    </div>
  );
}

export function MixerPanel({ s, act }: { s: DebugSnapshot; act: DebugActions }) {
  const m = s.mixer;
  return (
    <div class="panel br">
      <h4>Mixer</h4>
      <KV rows={[
        ['mode', m?.chosenMode ?? '--'], ['last cmd', m?.lastCommand ? fmtCmd(m.lastCommand) : '--'], ['result', m?.lastResult ?? '--'],
        ['effects', m ? m.activeEffects.map((e) => `${e.id}:${e.mode}`).join(' ') || 'none' : '--'],
      ]} />
      <div>diff {s.difficulty.toFixed(2)} <input type="range" min="0.5" max="1.5" step="0.05" value={s.difficulty} onInput={(e) => act.setDifficulty(+(e.target as HTMLInputElement).value)} />
        <button class="danger" onClick={() => act.panic(true)}>PANIC</button><button onClick={() => act.panic(false)}>release</button></div>
      <div>timeScale {s.timeScale}x <input type="range" min="1" max="100" step="1" value={s.timeScale} disabled={!s.fake} onInput={(e) => act.setTimeScale(+(e.target as HTMLInputElement).value)} /></div>
      <div>fake: <select value={s.fakeScript} onChange={(e) => act.setFakeScript((e.target as HTMLSelectElement).value)}>{s.scripts.map((n) => <option>{n}</option>)}</select>
        {(['cadence', 'power', 'hr'] as const).map((k) => <span>{k.slice(0, 3)} <button onClick={() => act.fakeAdjust(k, k === 'power' ? -10 : -5)}>-</button><button onClick={() => act.fakeAdjust(k, k === 'power' ? 10 : 5)}>+</button></span>)}</div>
      <TrainerTest applyTest={act.applyTest} />
      <h4>Game</h4>
      <KV rows={Object.entries(s.game).map(([k, v]) => [k, formatValue(v)])} />
    </div>
  );
}

function TuneRow({ t, act }: { t: TuningEntry; act: DebugActions }) {
  if (t.kind === 'bool') return <div title={t.help}>{t.key} <input type="checkbox" checked={!!t.value} onChange={(e) => act.setTuning(t.key, (e.target as HTMLInputElement).checked)} /></div>;
  if (t.kind === 'choice') return <div title={t.help}>{t.key} <select value={String(t.value)} onChange={(e) => act.setTuning(t.key, (e.target as HTMLSelectElement).value)}>{t.options?.map((o) => <option>{o}</option>)}</select></div>;
  return <div title={t.help}>{t.key} {formatValue(t.value as number)} <input type="range" min={t.min} max={t.max} step={t.step ?? 'any'} value={t.value as number} onInput={(e) => act.setTuning(t.key, +(e.target as HTMLInputElement).value)} /></div>;
}
export function TuningPanel({ s, act, open, toggle }: { s: DebugSnapshot; act: DebugActions; open: boolean; toggle: () => void }) {
  return (
    <div class="panel tune">
      <h4 onClick={toggle} style={{ cursor: 'pointer' }}>{open ? '[-]' : '[+]'} Tuning ({s.tuning.length})</h4>
      {open && <><button onClick={act.resetTuning}>reset to defaults</button>{s.tuning.map((t) => <TuneRow t={t} act={act} />)}</>}
    </div>
  );
}
