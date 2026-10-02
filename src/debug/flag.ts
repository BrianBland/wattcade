export function loadFlag(key: string, def: boolean): boolean {
  try { const v = localStorage.getItem(key); return v == null ? def : v === '1'; } catch { return def; }
}
export function saveFlag(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ }
}
