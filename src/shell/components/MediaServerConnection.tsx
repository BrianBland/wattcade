import { useState } from 'preact/hooks';
import { checkMediaServer, mediaServerConfig, saveMediaServerConfig, STREAM_BUFFER_OPTIONS } from '../../media';
import { Btn, Dot } from './Bits';

/** Optional app-wide extension, configured beside the bike devices. */
export function MediaServerConnection({ focused, onFocus }: { focused?: boolean; onFocus?: () => void }) {
  const [config, setConfig] = useState(mediaServerConfig), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [connected, setConnected] = useState(false);
  const save = (next: typeof config) => {
    setConfig(next); setConnected(false); setMessage('');
    try { saveMediaServerConfig(next); }
    catch { setMessage('Could not save media server settings. Allow browser storage to remember them after reopening.'); }
  };
  const connect = async () => {
    setBusy(true); setMessage('');
    try { const server = await checkMediaServer(config); saveMediaServerConfig({ ...config, enabled: true }); setConfig({ ...config, enabled: true }); setConnected(true); setMessage(`Connected · ${server.name}`); }
    catch (e) { setConnected(false); setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <details class={`card tile device media-server-connection${focused ? ' focused' : ''}${config.enabled ? ' on' : ''}`} onPointerDown={onFocus}>
    <summary class="device-top media-server-summary" aria-label="Media server setup" onClick={onFocus} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
      <span class="icon" aria-hidden="true">🎵</span><h3>Media server</h3><span class="spacer"/>
      <span class="media-server-state">{connected ? 'Connected' : config.enabled ? 'Enabled' : 'Optional'}</span><Dot on={connected}/>
    </summary>
    <label><input type="checkbox" checked={config.enabled} onChange={(e) => save({ ...config, enabled: e.currentTarget.checked })}/> Enable media extension</label>
    <label class="dim small">Server URL<input class="mp-search" aria-label="Media server URL" value={config.url} placeholder="https://media.example.com"
      onInput={(e) => save({ ...config, url: e.currentTarget.value })}/></label>
    <label class="dim small">Access token<input class="mp-search" aria-label="Media server token" type="password" value={config.token}
      onInput={(e) => save({ ...config, token: e.currentTarget.value })}/></label>
    <label class="dim small">Buffer ahead<select class="mp-search" aria-label="Buffer ahead" value={config.bufferS}
      onChange={(e) => save({ ...config, bufferS: Number(e.currentTarget.value) })}>
      {STREAM_BUFFER_OPTIONS.map((s) => <option value={s}>{s} seconds</option>)}
    </select></label>
    <div class="dim small">A longer buffer gives ride planning more time for steady efforts and breaks, but takes longer to start.</div>
    <Btn small disabled={busy || !config.url.trim()} onClick={() => void connect()}>{busy ? 'Connecting…' : 'Test connection'}</Btn>
    {message && <div role="status" class={connected ? 'device-live' : 'warn'}>{message}</div>}
    <div class="dim small note">Search YouTube and SoundCloud. Online mixes use estimated transitions and analyze the buffered audio as you ride. Server settings and the access token are saved in this browser on this device. Clear the token field to forget it.</div>
  </details>;
}
