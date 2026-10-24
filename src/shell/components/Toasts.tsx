import { useEffect, useState } from 'preact/hooks';
import { PixelIcon } from '../chrome/PixelIcon';
import '../chrome/chrome.css';

interface Toast { id: number; text: string; tone: 'info' | 'good'; achievement?: { description?: string; bonusXp?: number } }
let seq = 0;
const listeners = new Set<(t: Toast) => void>();
/** Show a short message over every screen. */
export function toast(text: string, tone: Toast['tone'] = 'info'): void { const t = { id: ++seq, text, tone }; listeners.forEach((l) => l(t)); }
export function achievementToast(name: string, description?: string, bonusXp?: number): void {
  const t: Toast = { id: ++seq, text: name, tone: 'good', achievement: { description, bonusXp } }; listeners.forEach(l => l(t));
}
export function Toasts() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const on = (t: Toast) => {
      setList((l) => [...l.slice(-2), t]);
      const timer = setTimeout(() => { timers.delete(timer); setList((l) => l.filter((x) => x.id !== t.id)); }, t.achievement ? 6000 : 4500);
      timers.add(timer);
    };
    listeners.add(on); return () => { listeners.delete(on); for (const timer of timers) clearTimeout(timer); };
  }, []);
  return <div class="toasts chrome-toasts" role="status" aria-live="polite" aria-atomic="false">{list.map((t) => <div key={t.id} class={`toast ${t.tone}${t.achievement ? ' achievement-toast' : ''}`}>
    {t.achievement ? <><span class="achievement-stamp"><PixelIcon kind="trophy" /></span><div class="achievement-copy"><small>ACHIEVEMENT UNLOCKED</small><b>{t.text}</b>{t.achievement.description && <p>{t.achievement.description}</p>}</div>{!!t.achievement.bonusXp && <span class="achievement-xp">{t.achievement.bonusXp} XP<small>bonus</small></span>}</> : t.text}
  </div>)}</div>;
}
