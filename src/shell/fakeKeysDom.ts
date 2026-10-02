import { fakeKeyAdjust } from './fakeKeys';
import { debugActions } from './services';

/** W/S cadence, E/D power, R/F HR on the fake bike of whatever session is running. */
export function attachFakeKeys(target: Window = window): () => void {
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
    const a = fakeKeyAdjust(e.code);
    if (a && !e.ctrlKey && !e.metaKey && !e.altKey) debugActions.fakeAdjust(a.k, a.delta);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
