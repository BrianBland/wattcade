import '../chrome/chrome.css';
import { ChromeHints } from '../chrome/ChromeHints';
import { PixelIcon } from '../chrome/PixelIcon';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { DeviceKind } from '../types';
import { Btn, Dot } from '../components/Bits';
import { Spinner } from '../components/ui';
import { addSecondController, connectDevice, controllerCount, controllerInfo, disconnectDevice, getDeviceStatus, getFake, downloadBluetoothLog, liveDevices, setFake, subscribeDevices, savedHrWatches, selectSavedHrWatch } from '../services';
import { MediaServerConnection } from '../components/MediaServerConnection';
import { useMenuNav } from '../useMenuNav';

const ITEMS: Array<{ kind: DeviceKind; label: string; note: string }> = [
  { kind: 'trainer', label: 'Trainer', note: 'KICKR CORE. Close Zwift on this iPad first.' },
  { kind: 'controller', label: 'Controller', note: 'Zwift Ride. Connect one "Zwift SF2", then + Add other side. Close Zwift first.' },
  { kind: 'hr', label: 'Heart rate', note: 'Garmin: enable Broadcast Heart Rate and record an Indoor Bike activity on the watch.' },
];

function live(kind: DeviceKind): string | null {
  const b = liveDevices();
  if (kind === 'trainer') return `${Math.round(b.raw.power)} W · ${Math.round(b.raw.cadence)} rpm`;
  if (kind === 'hr') return b.raw.hr == null ? '-- bpm' : `${Math.round(b.raw.hr)} bpm`;
  return `${controllerCount()} of 2 sides${controllerInfo.battery != null ? ` · 🔋 ${controllerInfo.battery}%` : ''}`;
}

export function Connect({ onDone }: { onDone: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);
  useEffect(() => subscribeDevices(() => force((n) => n + 1)), []);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 250); return () => clearInterval(id); }, []); // live readings
  const st = getDeviceStatus();
  const act = (i: number) => {
    if (i < 3) { const k = ITEMS[i].kind; void (st[k].busy || st[k].connected ? disconnectDevice(k) : connectDevice(k)); }
    else if (i === 3) list.current?.querySelector<HTMLElement>('.media-server-summary')?.click();
    else if (i === 4) onDone();
    else if (i === 5) setFake(!getFake());
    else downloadBluetoothLog();
  };
  const anyOn = ITEMS.some((it) => st[it.kind].connected);
  const [idx, setIdx] = useMenuNav(7, [4, 2, 1], act, onDone, true, { initial: 4 }); // default to Ride/Continue so a stray controller press can't disconnect a device
  useLayoutEffect(() => { list.current?.querySelector<HTMLElement>('.focused')?.scrollIntoView?.({ block: 'nearest' }); }, [idx]);
  return (
    <div class="screen chrome-ui connect-screen">
      <div class="screen-head chrome-head">
        <div><div class="chrome-eyebrow">WATTCADE / YOUR SETUP</div><h1>Ready to ride.</h1><div class="sub">{anyOn ? 'Connected devices ride with you through every game.' : 'Your saved setup connects automatically. Tap a device to choose it, or continue for a demo ride.'}</div></div>
      </div>
      <div class="connection-layout" ref={list}><div class="device-row">
        {ITEMS.map((it, i) => {
          const s = st[it.kind];
          return (
            <section class={`card tile device${idx === i ? ' focused' : ''}${s.connected ? ' on' : ''}`}>
              <button type="button" class="device-connect" aria-label={`${s.connected ? 'Disconnect' : 'Connect'} ${it.label}`} disabled={s.busy} onClick={() => { setIdx(4); act(i); }}>
                <span class="device-symbol"><PixelIcon kind={it.kind} /></span>
                <span class="device-heading"><strong>{it.label}</strong><span class="device-state">{s.busy ? (s.detail ? `Connecting: ${s.detail}` : 'Connecting…') : s.connected ? `Connected${it.kind === 'trainer' && s.detail ? ` · ${s.detail}` : ''}` : it.kind === 'trainer' ? 'Connect your bike' : 'Optional'}</span></span>
                <span class="device-status">{s.busy ? <Spinner /> : <Dot on={s.connected} />}{s.busy ? 'Connecting' : s.connected ? 'Disconnect' : 'Connect'}</span>
              </button>
              {s.connected && <div class="device-live">{live(it.kind)}</div>}
              {it.kind === 'hr' && !s.busy && s.detail && <div class="dim small">{s.detail}</div>}
              {it.kind === 'hr' && (s.connected || s.error || savedHrWatches().length > 0) && (
                <div class="row" onClick={(e) => e.stopPropagation()}>
                  {savedHrWatches().map((watch) => (
                    <button key={watch.id} class="btn small" disabled={s.busy || watch.selected} onClick={(e) => { e.stopPropagation(); void selectSavedHrWatch(watch.id); }}>
                      {s.busy ? 'Wait for connection:' : watch.selected ? 'Using' : 'Use'} {watch.name} · {watch.id.slice(-6)}
                    </button>
                  ))}
                  <button class="btn small" disabled={s.busy} onClick={(e) => { e.stopPropagation(); void connectDevice('hr'); }}>{s.error ? 'Select watch again' : '+ Add watch'}</button>
                </div>
              )}
              {s.busy && <button class="btn small" onClick={(e) => { e.stopPropagation(); void disconnectDevice(it.kind); }}>Cancel connection</button>}
              {!s.connected && !s.busy && s.detail && it.kind !== 'hr' && <div class="dim small">{s.detail}</div>}
              {s.error && <div class="warn">{s.error}</div>}
              {it.kind === 'controller' && s.connected && <div class="dim small">fw {controllerInfo.firmware ?? '?'}</div>}
              {it.kind === 'controller' && s.connected && controllerCount() < 2 && (
                <button class="btn small" disabled={s.busy} onClick={(e) => { e.stopPropagation(); void addSecondController(); }}>+ Add other side</button>
              )}
              {controllerInfo.warning && it.kind === 'controller' && <div class="warn">{controllerInfo.warning}</div>}
              <details class="device-help"><summary>Setup help</summary><p>{it.note}</p></details>
            </section>
          );
        })}
      <Btn class="connection-log" focused={idx === 6} onClick={downloadBluetoothLog}>Download Bluetooth log</Btn></div><aside class="connection-extras"><div class="chrome-eyebrow">MORE WAYS TO RIDE</div><MediaServerConnection focused={idx === 3} onFocus={() => setIdx(3)}/></aside></div>
      <div class="row connection-actions">
        <Btn primary focused={idx === 4} onClick={onDone}>Continue →</Btn>
        <Btn focused={idx === 5} onClick={() => act(5)}>{getFake() ? 'Demo bike: on' : 'Try a demo ride'}</Btn>
      </div>
      <ChromeHints hints={[['dpad', 'Move'], ['a', 'Connect / select'], ['b', 'Continue']]} />
    </div>
  );
}
