import { useState } from 'preact/hooks';
import type { AimMode, Profile, ZoneSource } from '../../contracts';
import { Btn } from '../components/Bits';
import { exportBackup, importBackup } from '../services';

const COLORS = ['#00f0ff', '#ff2bd6', '#b6ff3b', '#ffb020', '#7a5cff', '#ff4d6d', '#2de2a6', '#ffffff'];

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return <><label>{label}</label><input type="number" value={value} step={step} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} /></>;
}

export function ProfileEditor({ profile, onSave, onCancel, onDelete }: { profile: Profile; onSave: (p: Profile) => void; onCancel: () => void; onDelete?: (p: Profile) => void }) {
  const [p, setP] = useState<Profile>(profile);
  const [msg, setMsg] = useState('');
  const set = (patch: Partial<Profile>) => setP({ ...p, ...patch });
  const setS = (patch: Partial<Profile['settings']>) => setP({ ...p, settings: { ...p.settings, ...patch } });
  const doExport = async () => {
    const blob = new Blob([await exportBackup()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wattcade-backup.json'; a.click();
  };
  const doImport = (f: File | undefined) => f && f.text().then(importBackup).then(() => setMsg('Imported. Reload to see profiles.')).catch((e) => setMsg(String(e)));
  return (
    <div class="screen">
      <h2>{profile.name ? 'Edit profile' : 'New profile'}</h2>
      <div class="form">
        <label>Name</label><input value={p.name} onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} />
        <label>Color</label><div class="row">{COLORS.map((c) => <span class={`swatch${p.color === c ? ' on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} />)}</div>
        <Num label="FTP (W)" value={p.ftp} onChange={(ftp) => set({ ftp })} />
        <Num label="Max HR (bpm)" value={p.maxHr} onChange={(maxHr) => set({ maxHr })} />
        <Num label="Weight (kg)" value={p.weightKg} onChange={(weightKg) => set({ weightKg })} />
        <label>Zone source</label>
        <select value={p.settings.zoneSource} onChange={(e) => setS({ zoneSource: (e.target as HTMLSelectElement).value as ZoneSource })}>
          <option value="auto">Auto (HR if available)</option><option value="power">Power</option><option value="hr">Heart rate</option>
        </select>
        <label>Aim mode</label>
        <select value={p.settings.aimMode} onChange={(e) => setS({ aimMode: (e.target as HTMLSelectElement).value as AimMode })}>
          <option value="rotate">Rotate (paddles)</option><option value="auto">Auto</option><option value="axes">Axes</option><option value="buttons">Buttons</option>
        </select>
        <Num label="Paddle deadzone" value={p.settings.paddleDeadzone} onChange={(paddleDeadzone) => setS({ paddleDeadzone })} />
        <label>Invert left paddle</label><input type="checkbox" checked={p.settings.paddleInvertL} onChange={(e) => setS({ paddleInvertL: (e.target as HTMLInputElement).checked })} />
        <label>Invert right paddle</label><input type="checkbox" checked={p.settings.paddleInvertR} onChange={(e) => setS({ paddleInvertR: (e.target as HTMLInputElement).checked })} />
        <Num label="Max grade (%)" value={p.settings.maxGradePct} onChange={(maxGradePct) => setS({ maxGradePct })} />
      </div>
      <div class="row">
        <Btn primary onClick={() => onSave({ ...p, name: p.name.trim() || 'Rider' })}>Save</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
        {onDelete && <Btn onClick={() => confirm(`Delete ${p.name}?`) && onDelete(p)}>Delete</Btn>}
      </div>
      <h2>Backup</h2>
      <div class="row"><Btn small onClick={doExport}>Export JSON</Btn>
        <label class="btn small">Import JSON<input type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => doImport((e.target as HTMLInputElement).files?.[0])} /></label>
        <span class="dim">{msg}</span></div>
    </div>
  );
}
