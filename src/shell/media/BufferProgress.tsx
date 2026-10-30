import { useEffect, useRef, useState } from 'preact/hooks';

type Progress = { readyS: number; targetS: number } | null;
/** Keep short waits quiet; report actual ready audio after five seconds, never a guessed ETA. */
export function BufferProgress({ read }: { read: () => Progress }) {
  const latest = useRef(read); latest.current = read;
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState<Progress>(null);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const poll = () => setProgress(latest.current());
    const delay = setTimeout(() => { poll(); setVisible(true); interval = setInterval(poll, 250); }, 5000);
    return () => { clearTimeout(delay); clearInterval(interval); };
  }, []);
  if (!visible) return null;
  const target = progress && Number.isFinite(progress.targetS) && progress.targetS > 0 ? progress.targetS : undefined;
  const ready = target && progress && Number.isFinite(progress.readyS) ? Math.max(0, Math.min(target, progress.readyS)) : undefined;
  return <div class="music-buffer-progress">
    <progress aria-label="Music preparation" max={target ?? 1} value={ready} />
    <small>{target && ready !== undefined ? `${Math.floor(100 * ready / target + 1e-6)}% · ${Math.floor(ready + 1e-6)} of ${Math.ceil(target)} seconds ready` : 'Preparing audio…'}</small>
  </div>;
}
