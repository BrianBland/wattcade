import { useEffect, useState } from 'preact/hooks';

interface Toast { id: number; text: string; tone: 'info' | 'good' }
let seq = 0;
const listeners = new Set<(t: Toast) => void>();
/** Show a short message over every screen. */
export function toast(text: string, tone: Toast['tone'] = 'info'): void { const t = { id: ++seq, text, tone }; listeners.forEach((l) => l(t)); }

export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    const on = (t: Toast) => {
      setList((l) => [...l.slice(-2), t]);
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 4500);
    };
    listeners.add(on); return () => { listeners.delete(on); };
  }, []);
  return <div class="toasts">{list.map((t) => <div key={t.id} class={`toast ${t.tone}`}>{t.text}</div>)}</div>;
}
