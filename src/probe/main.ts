// Standalone BLE probe: lists services/characteristics, reads/subscribes everything, hex log, Copy/Download.
// Intentionally imports no game code (only the pure Ride codec for live parsed output).
import { toHex, propsList, fmtLine, isPrintable } from './format';
import { parseRideMessage, PolarityDetector, RIDE_ON } from '../devices/zwiftRide/codec';
import { RIDE_REQUEST_OPTIONS } from '../devices/zwiftRide/controller';

const KNOWN_SERVICES: Array<number | string> = [
  0x1800, 0x1801, 0x180a, 0x180d, 0x180f, 0x1814, 0x1816, 0x1818, 0x1826, 0x1827, 0x1828, 0xfc82, 0xfee0, 0xfee7, 0xfff0,
  '00000001-19ca-4651-86e5-fa29dcdd09d1', 'a026ee01-0a7d-4ab3-97fa-f1500f9feb8b', '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e',
  '6e400001-b5a0-f393-e0a9-e50e24dcca9e', 'ba5c0001-b5a0-f393-e0a9-e50e24dcca9e',
];

const t0 = performance.now();
const lines: string[] = [];
let logEl: HTMLPreElement; let parsedEl: HTMLDivElement; let treeEl: HTMLDivElement;
let device: BluetoothDevice | undefined;
let rideRx: BluetoothRemoteGATTCharacteristic | undefined;
const polarity = new PolarityDetector();

function log(tag: string, text: string) {
  const l = fmtLine(performance.now() - t0, tag, text);
  lines.push(l);
  logEl.textContent += l + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & { style?: string } = {}, ...kids: Array<Node | string>) {
  const { style, ...rest } = props;
  const e = Object.assign(document.createElement(tag), rest);
  if (style) e.style.cssText = style;
  for (const k of kids) e.append(k);
  return e;
}

async function pick(label: string, opts: RequestDeviceOptions, ride = false) {
  try {
    if (!navigator.bluetooth) { log('ERROR', 'Web Bluetooth not available (use Chrome or Bluefy over HTTPS)'); return; }
    log('PICK', label);
    if (device?.gatt?.connected) device.gatt.disconnect();
    device = await navigator.bluetooth.requestDevice(opts);
    log('DEVICE', `${device.name ?? '(no name)'} id=${device.id}`);
    device.addEventListener('gattserverdisconnected', () => log('DISCONN', 'gattserverdisconnected'));
    const server = await device.gatt!.connect();
    log('CONNECT', 'GATT connected');
    await explore(server, ride);
  } catch (e) { log('ERROR', e instanceof Error ? `${e.name}: ${e.message}` : `non-Error rejection: ${JSON.stringify(e)} (${typeof e})`); }
}

async function explore(server: BluetoothRemoteGATTServer, ride: boolean) {
  treeEl.textContent = '';
  const services = await server.getPrimaryServices();
  log('SERVICES', services.map((s) => s.uuid).join(', '));
  const notifiers: BluetoothRemoteGATTCharacteristic[] = [];
  for (const s of services) {
    const sBox = el('div', {}, el('b', { textContent: 'service ' + s.uuid }));
    treeEl.append(sBox);
    let chars: BluetoothRemoteGATTCharacteristic[] = [];
    try { chars = await s.getCharacteristics(); } catch (e) { log('ERROR', `chars ${s.uuid}: ${e}`); continue; }
    for (const c of chars) {
      const p = propsList(c.properties as unknown as Record<string, boolean>);
      sBox.append(el('div', { textContent: `  char ${c.uuid}  [${p}]`, style: 'margin-left:1em' }));
      log('CHAR', `${s.uuid} / ${c.uuid} [${p}]`);
      if (c.properties.read) {
        try {
          const v = await c.readValue(); const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
          log('READ', `${c.uuid} = ${toHex(v)}${isPrintable(u) ? '  "' + new TextDecoder().decode(u) + '"' : ''}`);
        } catch (e) { log('READ-ERR', `${c.uuid}: ${e}`); }
      }
      if (c.properties.notify || c.properties.indicate) notifiers.push(c);
      if (ride && c.uuid.toLowerCase().startsWith('00000003-19ca')) rideRx = c;
    }
  }
  for (const c of notifiers) {
    try {
      c.addEventListener('characteristicvaluechanged', () => {
        const v = c.value!; const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        log('NOTIFY', `${c.uuid} ${toHex(v)}`);
        if (ride) showRide(u);
      });
      await c.startNotifications();
      log('SUB', c.uuid);
    } catch (e) { log('SUB-ERR', `${c.uuid}: ${e}`); }
  }
  if (ride) log('INFO', 'Ride: press "Send RideOn" to start the controller streaming.');
}

function showRide(u: Uint8Array) {
  const m = parseRideMessage(u);
  if (m.kind === 'status') {
    let btns = '(unchanged)';
    if (m.buttonMapRaw !== null) {
      if (polarity.feed(m.buttonMapRaw)) log('POLARITY', 'flipped');
      btns = [...polarity.decode(m.buttonMapRaw)].join(' ') || '(none)';
      btns += `   map=0x${m.buttonMapRaw.toString(16)}`;
    }
    parsedEl.textContent = `buttons: ${btns}\npaddleL: ${m.paddles[0] ?? 0}   paddleR: ${m.paddles[1] ?? 0}`;
  } else if (m.kind === 'battery') parsedEl.textContent = `battery: ${m.pct}%`;
  else log('OTHER', `opcode 0x${m.opcode.toString(16)}${m.malformed ? ' malformed' : ''}`);
}

async function sendRideOn() {
  try {
    if (!rideRx) { log('ERROR', 'No Sync RX (…0003) characteristic found; pick the Zwift Ride first'); return; }
    if (rideRx.writeValueWithoutResponse) await rideRx.writeValueWithoutResponse(RIDE_ON as BufferSource);
    else await rideRx.writeValue(RIDE_ON as BufferSource);
    log('WRITE', `${rideRx.uuid} ${toHex(RIDE_ON)} ("RideOn")`);
  } catch (e) { log('ERROR', String(e)); }
}

function download() {
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `wattcade-probe-${new Date().toISOString().replace(/[:.]/g, '-')}.txt` });
  document.body.append(a); a.click(); a.remove();
}
async function copy() {
  try { await navigator.clipboard.writeText(lines.join('\n')); log('INFO', 'copied'); }
  catch (e) {
    const r = document.createRange(); r.selectNodeContents(logEl); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r);
    log('INFO', 'clipboard blocked; log selected, copy manually (' + e + ')');
  }
}

function build() {
  document.title = 'wattcade BLE probe';
  const root = document.getElementById('probe')!;
  root.style.cssText = 'font:14px system-ui,sans-serif;padding:12px;max-width:900px;margin:auto;color:#111;background:#fff;';
  const btn = (text: string, fn: () => void) => el('button', { textContent: text, onclick: fn, style: 'margin:4px;padding:10px 14px;font-size:15px' });
  logEl = el('pre', { style: 'background:#111;color:#9f9;padding:8px;height:320px;overflow:auto;font-size:12px;white-space:pre-wrap' });
  parsedEl = el('div', { style: 'white-space:pre;font-family:monospace;background:#eef;padding:8px;min-height:3em' });
  parsedEl.textContent = 'Ride parsed output appears here';
  treeEl = el('div', { style: 'font-family:monospace;font-size:12px;white-space:pre-wrap' });
  root.append(
    el('h2', { textContent: 'wattcade BLE probe' }),
    btn('Pick any device', () => pick('any', { acceptAllDevices: true, optionalServices: KNOWN_SERVICES })),
    btn('Pick Zwift Ride', () => pick('ride', RIDE_REQUEST_OPTIONS, true)),
    btn('Ride A: name only', () => pick('ride-A name only', { filters: [{ namePrefix: 'Zwift' }] }, true)),
    btn('Ride E: name + 128-bit svcs', () => pick('ride-E name+128bit', RIDE_REQUEST_OPTIONS, true)),
    btn('Ride B: name + fc82', () => pick('ride-B name+fc82', { filters: [{ namePrefix: 'Zwift' }], optionalServices: [0xfc82] }, true)),
    btn('Ride C: any + fc82', () => pick('ride-C any+fc82', { acceptAllDevices: true, optionalServices: [0xfc82] }, true)),
    btn('Ride D: service fc82', () => pick('ride-D svc fc82', { filters: [{ services: [0xfc82] }] }, true)),
    btn('Pick FTMS', () => pick('ftms', { filters: [{ services: [0x1826] }], optionalServices: KNOWN_SERVICES })),
    btn('Pick HR', () => pick('hr', { filters: [{ services: [0x180d] }], optionalServices: KNOWN_SERVICES })),
    btn('Send RideOn', sendRideOn),
    btn('Disconnect', () => device?.gatt?.disconnect()),
    btn('Copy log', copy), btn('Download log', download),
    btn('Clear', () => { lines.length = 0; logEl.textContent = ''; }),
    parsedEl, logEl, el('h3', { textContent: 'Services / characteristics' }), treeEl,
  );
  log('INFO', `UA: ${navigator.userAgent}`);
  log('INFO', navigator.bluetooth ? 'Web Bluetooth available' : 'Web Bluetooth NOT available');
}
build();
