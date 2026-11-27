// Live-update UI: the in-ride chip (new versions of this game, Apply / Skip logic) and the pause-menu versions list
// (every version of this game, rollback, save backups). Styles: live.css.
import './live.css';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Btn } from '../shell/components/Bits';
import { toast } from '../shell/components/Toasts';
import { useMenuNav } from '../shell/useMenuNav';
import { ago, KIND_ORDER, type Kind } from './feed';
import { kindLabel, type LiveHost } from './host';
import { live } from './client';
import type { LiveVersion } from './types';

function useHost(host: LiveHost | null) {
  const [, tick] = useState(0);
  useEffect(() => host?.subscribe(() => tick((n) => n + 1)), [host]);
}

export function Kinds({ kinds }: { kinds: Set<Kind> }) {
  return <>{KIND_ORDER.filter((k) => kinds.has(k)).map((k) => <span key={k} class={`live-kind ${k}`}>{kindLabel[k]}</span>)}</>;
}

const run = async (host: LiveHost, to: LiveVersion | null, skip = false) => {
  const msg = await host.apply(to, skip);
  if (msg) toast(msg, msg.startsWith("Couldn't") ? 'info' : 'good');
};

/** Floating chip over the game: shows how many new versions of this game wait; opens the tray. */
export function LiveChip({ host, hidden }: { host: LiveHost | null; hidden?: boolean }) {
  useHost(host);
  const [open, setOpen] = useState(false);
  if (!host || !live.isEnabled() || hidden) return null;
  const pending = host.pending();
  const shell = host.shellPending();
  if (!pending.length && !shell.length && !open) return null;
  const now = Date.now();
  return <div class="live-anchor chrome-ui">
    <button class={`live-chip${pending.length ? ' has' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)} disabled={host.busy}>
      <span class="live-count">{host.busy ? '…' : pending.length}</span>{host.busy ? 'Applying' : pending.length === 1 ? 'update' : pending.length ? 'updates' : 'app update'}
    </button>
    {open && <div class="live-tray" role="dialog" aria-label="New versions">
      <h3>New for {host.game.title}</h3>
      {pending.map(({ v, kinds }, i) => {
        const logic = !!host.preview(v)?.simNextStart; // up to here, counting the versions before it
        return <div class="live-row" key={v.sha}>
          <span class="live-sha">{v.short}</span>
          <span class="live-msg">{v.message || '(no message)'}</span>
          <span class="live-meta"><Kinds kinds={kinds} />{ago(v.time, now)}{i < pending.length - 1 ? ` · with ${pending.length - 1 - i} earlier` : ''}</span>
          <span class="live-acts">
            <Btn small primary onClick={() => { setOpen(false); void run(host, v); }}>{logic ? 'Apply all' : 'Apply'}</Btn>
            {logic && <Btn small onClick={() => { setOpen(false); void run(host, v, true); }}>Skip logic</Btn>}
          </span>
        </div>;
      })}
      {!pending.length && <p class="live-note">This game is up to date.</p>}
      {pending.some((p) => p.kinds.has('logic')) && <p class="live-note">Tuning and art apply now. Logic changes apply {host.game.liveCheckpoint ?? 'the next time you start the game'}.</p>}
      {shell.length > 0 && <p class="live-note"><span class="live-kind shell">app</span>An app update ({shell[0].short}) is out. It loads when you reload after this ride.</p>}
    </div>}
  </div>;
}

/** Pause-menu screen: every version of this game, which layers run where, rollback, and save backups. */
export function LiveVersions({ host, onClose }: { host: LiveHost; onClose: () => void }) {
  useHost(host);
  const now = Date.now();
  const rows = host.history();
  const builtIn = host.builtInVersion();
  const builtInListed = !!builtIn && rows.some((r) => r.v.sha === builtIn.sha);
  const backups = host.store.backups(host.game.id);
  const pendingRestore = host.store.pendingRestore(host.game.id);
  // the built-in copy is its feed row when listed, else a row of its own
  const targets: Array<LiveVersion | null> = [...rows.map((r) => (r.v.sha === builtIn?.sha ? null : r.v)), ...(builtInListed ? [] : [null])];
  // focusable actions in order: per row "Use", then backups, then Back
  const actions = useMemo(() => [
    ...targets.map((t) => () => void run(host, t)),
    ...backups.map((_b, i) => () => host.restoreNextStart(pendingRestore === i ? null : i)),
    onClose,
  ], [rows.length, builtInListed, backups.length, pendingRestore, host]);
  const [idx, setIdx] = useMenuNav(actions.length, 1, (i) => actions[i](), onClose);
  useEffect(() => { document.querySelector('.live-versions .focused')?.scrollIntoView?.({ block: 'nearest' }); }, [idx]);
  const marks = (shas: Array<string | null>) => {
    const all = shas.flatMap((x) => host.marks(x));
    const now = all.filter((m) => !m.includes('next')), next = all.filter((m) => m.includes('next'));
    const at = (w: string) => next.filter((m) => m.endsWith(w)).map((m) => m.replace(` next ${w}`, ''));
    return <>{now.length > 0 && <span class="live-mark">running {now.join(' + ')}</span>}
      {at('checkpoint').length > 0 && <span class="live-mark queued">next checkpoint: {at('checkpoint').join(' + ')}</span>}
      {at('start').length > 0 && <span class="live-mark queued">next start: {at('start').join(' + ')}</span>}</>;
  };
  const use = (i: number) => <span class="live-acts"><Btn small focused={idx === i} disabled={host.busy} onClick={() => { setIdx(i); actions[i](); }}>Use</Btn></span>;
  return <div class="overlay-modal chrome-ui">
    <section class="modal live-versions" role="dialog" aria-modal="true" aria-label="Versions">
      <div class="live-head"><h2>Versions</h2><span class="dim">{host.game.title}{live.error ? ` · feed: ${live.error}` : ''}</span></div>
      <ol class="live-list">
        {rows.map(({ v, kinds }, i) => {
          const isBuiltIn = v.sha === builtIn?.sha, shas = isBuiltIn ? [v.sha, null] : [v.sha];
          return <li key={v.sha} class={shas.some((x) => host.marks(x).length) ? 'on' : ''}>
            <span class="live-sha">{v.short}</span>
            <span class="live-msg">{v.message || '(no message)'}</span>
            <span class="live-meta"><Kinds kinds={kinds} />{ago(v.time, now)}{isBuiltIn ? <span class="live-mark built">built in</span> : null}{marks(shas)}</span>
            {use(i)}
          </li>;
        })}
        {!builtInListed && <li class={host.marks(null).length ? 'on' : ''}>
          <span class="live-sha">app</span><span class="live-msg">Built-in copy (what this app shipped with)</span>
          <span class="live-meta">{marks([null])}</span>
          {use(rows.length)}
        </li>}
      </ol>
      {!rows.length && <p class="live-note">{live.feed ? 'No published versions of this game yet.' : 'Looking for versions…'}</p>}
      <p class="live-note">"Use" moves tuning and art now; logic changes wait for {host.game.liveCheckpoint ?? 'the next start'}. Your save is backed up whenever the logic changes.</p>
      {backups.length > 0 && <div class="live-backups">
        <h3>Save backups</h3>
        {backups.map((b, i) => <div class="live-row" key={b.time}>
          <span class="live-msg">{ago(b.time, now)}, before logic {b.afterSim?.slice(0, 7) ?? 'built-in'}</span>
          <span class="live-acts"><Btn small focused={idx === targets.length + i} onClick={() => { setIdx(targets.length + i); actions[targets.length + i](); }}>
            {pendingRestore === i ? 'Restoring next start ✓' : 'Restore next start'}</Btn></span>
        </div>)}
      </div>}
      <Btn focused={idx === actions.length - 1} onClick={onClose}>Back to pause</Btn>
    </section>
  </div>;
}
