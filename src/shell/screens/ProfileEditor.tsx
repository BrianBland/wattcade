import '../chrome/chrome.css';
import { ChromeHints } from '../chrome/ChromeHints';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Profile } from '../../contracts';
import { Btn } from '../components/Bits';
import { RiderAvatar } from '../components/RiderAvatar';
import { Choice, Field, Stepper, Toggle } from '../components/ui';
import { exportBackup, importBackup } from '../services';
import { COLORS, editorFields, activateField, adjustField, type FieldDef } from '../editorFields';
import { useMenuNav } from '../useMenuNav';
import { onMenuPress } from '../menuInput';

const COLOR_NAMES = ['Cyan', 'Pink', 'Lime', 'Amber', 'Purple', 'Rose', 'Mint', 'White'];

/**
 * Every row is reachable with the D-pad: up/down picks a row, left/right changes it, A toggles / cycles / types.
 * Delete needs a second A to confirm (no browser dialog, so it works from the bike).
 */
export function ProfileEditor({ profile, onSave, onCancel, onDelete }: { profile: Profile; onSave: (p: Profile) => void; onCancel: () => void; onDelete?: (p: Profile) => void }) {
  const [p, setP] = useState<Profile>(profile);
  const [msg, setMsg] = useState('');
  const [armDelete, setArmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isNew = !profile.name;

  const save = () => onSave({ ...p, name: p.name.trim() || 'Rider' });
  const doExport = async () => {
    const blob = new Blob([await exportBackup()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wattcade-backup.json'; a.click();
    setMsg('Backup downloaded.');
  };
  const doImport = (f: File | undefined) => f && f.text().then(importBackup).then(() => setMsg('Imported. Reload to see profiles.')).catch((e) => setMsg(String(e)));
  const del = () => { if (!onDelete) return; if (armDelete) onDelete(p); else { setArmDelete(true); setMsg(`Press Delete again to remove ${p.name || 'this rider'}.`); } };

  const actions: Array<{ label: string; run: () => void; primary?: boolean }> = [
    { label: isNew ? 'Create rider →' : 'Save changes →', run: save, primary: true }, { label: 'Cancel', run: onCancel },
    ...(onDelete ? [{ label: armDelete ? 'Really delete?' : 'Delete', run: del }] : []),
    { label: 'Export backup', run: () => void doExport() }, { label: 'Import backup', run: () => fileRef.current?.click() },
  ];
  const fields = editorFields(p);
  const nF = fields.length;
  const rows = [...fields.map(() => 1), 2, actions.length - 2];
  const [idx, setIdx] = useMenuNav(nF + actions.length, rows, (i) => {
    if (i >= nF) { actions[i - nF].run(); return; }
    const f = fields[i];
    if (f.kind === 'text') { nameRef.current?.focus(); return; }
    const next = activateField(f, p); if (next) setP(next);
  }, onCancel, true, {
    onAdjust: (i, d) => { if (i >= nF) return false; const next = adjustField(fields[i], p, d); if (next) { setP(next); return true; } return false; },
  });
  const deleteIdx = onDelete ? nF + 2 : -1;
  useEffect(() => { if (idx !== deleteIdx) setArmDelete(false); }, [idx]);
  // keep the focused row on screen; leave the name box when the D-pad moves
  useEffect(() => { listRef.current?.querySelectorAll('.field, .actions .btn')[idx]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [idx]);
  useEffect(() => onMenuPress((pr) => { if (['up', 'down'].some((k) => pr.has(k as 'up'))) nameRef.current?.blur(); }), []);

  const control = (f: FieldDef, i: number) => {
    switch (f.kind) {
      case 'text': return <input ref={nameRef} type="text" aria-label="Rider name" value={p.name} placeholder="Rider name" onFocus={() => setIdx(i)} onInput={(e) => setP({ ...p, name: (e.target as HTMLInputElement).value })} onKeyDown={(e) => {
        // leave the text box with Enter / Esc / up / down so keyboard users aren't trapped in it
        if (['Enter', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); (e.target as HTMLInputElement).blur(); if (e.key === 'ArrowDown') setIdx(i + 1); }
      }} />;
      case 'color': return <div class="swatches" role="group" aria-label="Rider color">{COLORS.map((c, j) => <button key={c} type="button" class={`swatch${p.color === c ? ' on' : ''}`} aria-label={COLOR_NAMES[j]} aria-pressed={p.color === c} style={{ '--swatch': c } as Record<string, string>} onFocus={() => setIdx(i)} onClick={() => setP({ ...p, color: c })} />)}</div>;
      case 'num': return <Stepper value={f.get(p)} step={f.step} min={f.min} max={f.max} unit={f.unit} digits={f.digits} onChange={(v) => setP(f.set(p, v))} />;
      case 'choice': return <Choice value={f.get(p)} options={f.options} onChange={(v) => setP(f.set(p, v))} />;
      case 'bool': return <Toggle on={f.get(p)} onChange={(v) => setP(f.set(p, v))} />;
    }
  };
  return (
    <div class="screen chrome-ui rider-editor" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'BUTTON') e.stopPropagation(); }}>
      <div class="screen-head chrome-head">
        <div><div class="chrome-eyebrow">WATTCADE / {isNew ? 'NEW RIDER' : 'RIDER SETTINGS'}</div><h1>{isNew ? 'New rider.' : 'Your rider.'}</h1><div class="sub">{isNew ? 'Choose your name, color and ride settings.' : 'Fine-tune your profile and ride settings.'}</div></div>
        <RiderAvatar profile={p} size="big" />
      </div>
      <div class="editor" ref={listRef}>
        <div class="fields editor-fields">
          {fields.map((f, i) => <div key={f.id} class={`editor-row editor-${f.kind}`}><Field label={f.label} focused={idx === i} hint={'hint' in f ? f.hint : undefined} onClick={() => setIdx(i)}>{control(f, i)}</Field></div>)}
        </div>
        <div class="actions editor-actions">
          <div class="row editor-primary">{actions.slice(0, 2).map((a, j) => <Btn key={a.label} primary={a.primary} focused={idx === nF + j} onClick={a.run}>{a.label}</Btn>)}</div>
          <div class="row editor-secondary">{actions.slice(2).map((a, j) => <Btn key={a.label} focused={idx === nF + 2 + j} onClick={a.run}>{a.label}</Btn>)}</div>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => doImport((e.target as HTMLInputElement).files?.[0])} />
        </div>
        {msg && <div class="warn editor-message" role="status">{msg}</div>}
      </div>
      <ChromeHints hints={[['dpad', 'Move'], ['lr', 'Change'], ['a', 'Toggle / type'], ['b', 'Cancel']]} />
    </div>
  );
}
