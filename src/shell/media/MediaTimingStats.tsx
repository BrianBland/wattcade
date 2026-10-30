import { useEffect, useState } from 'preact/hooks';
import type { MediaTimings, MediaTimingRow, MediaStage } from '../../media/online/timing';
const LABELS: Record<MediaStage, string> = { fetch: 'Fetch (server + network)', decode: 'Decode', downmix: 'Downmix', analysis: 'Analysis (worker + queue)', commit: 'Timeline commit' };
/** No collector, no timer, no diagnostic UI when the player's flag is off. */
export function MediaTimingStats({ timings }: { timings?: MediaTimings }) {
  const [rows, setRows] = useState<MediaTimingRow[]>([]);
  useEffect(() => {
    setRows(timings?.snapshot() ?? []);
    if (!timings) return;
    const timer = setInterval(() => setRows(timings.snapshot()), 500);
    return () => clearInterval(timer);
  }, [timings]);
  if (!timings) return null;
  return <details class="media-timing-stats"><summary>Debug: media timings</summary>
    <small>Milliseconds per stage; overlapping totals are not elapsed wait time. This music queue only.</small>
    <table><thead><tr><th>Stage</th><th>Calls</th><th>Avg</th><th>Last</th><th>Max</th><th>Total</th><th>Active / peak</th><th>Failed</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.stage}><th>{LABELS[r.stage]}</th><td>{r.count}</td><td>{Math.round(r.totalMs / Math.max(1, r.count))}</td><td>{Math.round(r.lastMs)}</td><td>{Math.round(r.maxMs)}</td><td>{Math.round(r.totalMs)}</td><td>{r.active} / {r.peak}</td><td>{r.failed}</td></tr>)}</tbody>
    </table>
    {!rows.length && <small>No windows prepared yet.</small>}
  </details>;
}
