import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/** Renders its children only after `ms` (0 = right away). */
export function Delayed({ ms, children }: { ms: number; children: ComponentChildren }) {
  const [shown, setShown] = useState(ms <= 0);
  useEffect(() => { if (ms <= 0) return; const id = setTimeout(() => setShown(true), ms); return () => clearTimeout(id); }, [ms]);
  return shown ? <>{children}</> : null;
}
