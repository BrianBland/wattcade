import { useEffect, useState } from 'preact/hooks';
import { toast } from './Toasts';

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

const fsElement = () => { const d = document as FsDoc; return d.fullscreenElement ?? d.webkitFullscreenElement ?? null; };
const canFullscreen = () => { const e = document.documentElement as FsEl; return !!(e.requestFullscreen || e.webkitRequestFullscreen); };

/** Small corner toggle that hides the browser chrome (Fullscreen API, webkit-prefixed fallback). Where the browser exposes no Fullscreen API (e.g. Bluefy, iPhone Safari) it explains the alternative. */
export function FullscreenButton() {
  const [on, setOn] = useState(!!fsElement());
  useEffect(() => {
    const sync = () => setOn(!!fsElement());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
  }, []);
  const toggle = () => {
    if (!canFullscreen()) { toast('Full screen isn\'t available in this browser. Try Share → Add to Home Screen, or hide the toolbar in the browser\'s own settings.'); return; }
    const d = document as FsDoc; const e = document.documentElement as FsEl;
    const p = fsElement() ? (d.exitFullscreen ?? d.webkitExitFullscreen)?.call(d) : (e.requestFullscreen ?? e.webkitRequestFullscreen)?.call(e);
    p?.catch(() => toast('Full screen was blocked by the browser.'));
  };
  return (
    <button type="button" class="fs-btn" tabIndex={-1} aria-label={on ? 'Exit full screen' : 'Full screen'} title={on ? 'Exit full screen' : 'Full screen'} onClick={toggle}>
      {on ? '🗗' : '⛶'}
    </button>
  );
}
