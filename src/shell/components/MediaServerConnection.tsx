import { useState } from 'preact/hooks';
import { checkMediaServer, mediaServerConfig, saveMediaServerConfig } from '../../media';
import { Btn, Dot } from './Bits';

/** Optional app-wide extension, configured beside the bike devices. */
export function MediaServerConnection({ focused, onFocus }: { focused?: boolean; onFocus?: () => void }) {
  const [config, setConfig] = useState(mediaServerConfig), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [connected, setConnected] = useState(false);
  const save = (next: typeof config) => { setConfig(next); saveMediaServerConfig(next); setConnected(false); setMessage(''); };
  const connect = async () => {
    setBusy(true); setMessage('');
    try { const server = await checkMediaServer(config); saveMediaServerConfig({ ...config, enabled: true }); setConfig({ ...config, enabled: true }); setConnected(true); setMessage(`Connected · ${server.name}`); }
    catch (e) { setConnected(false); setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <div class={`card tile device${focused ? ' focused' : ''}${config.enabled ? ' on' : ''}`} onPointerDown={onFocus}>
    <div class="device-top"><span class="icon">🎵</span><h3>Media server</h3><span class="spacer"/><Dot on={connected}/></div>
    <label><input type="checkbox" checked={config.enabled} onChange={(e) => save({ ...config, enabled: e.currentTarget.checked })}/> Enable media extension</label>
    <label class="dim small">Server URL<input class="mp-search" aria-label="Media server URL" value={config.url} placeholder="https://media.example.com"
      onInput={(e) => save({ ...config, url: e.currentTarget.value })}/></label>
    <label class="dim small">Access token<input class="mp-search" aria-label="Media server token" type="password" value={config.token}
      onInput={(e) => save({ ...config, token: e.currentTarget.value })}/></label>
    <label class="dim small">Buffer ahead<select class="mp-search" aria-label="Buffer ahead" value={config.bufferS}
      onChange={(e) => save({ ...config, bufferS: Number(e.currentTarget.value) })}>
      {[60, 90, 120, 180].map((s) => <option value={s}>{s} seconds</option>)}
    </select></label>
    <Btn small disabled={busy || !config.url.trim()} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Test connection'}</Btn>
    {message && <div role="status" class={connected ? 'device-live' : 'warn'}>{message}</div>}
    <div class="dim small note">Search YouTube and SoundCloud. Online mixes use estimated transitions and analyze the buffered audio as you ride. The token lasts for this tab; server settings are remembered.</div>
  </div>;
}
