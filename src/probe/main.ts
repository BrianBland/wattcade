// Standalone BLE probe: lists services/characteristics, reads/subscribes everything, hex log, Copy/Download.
// Intentionally imports no game code (only the pure Ride codec for live parsed output).
import { toHex, propsList, fmtLine, isPrintable } from './format';
import { parseRideMessage, PolarityDetector, RIDE_ON } from '../devices/zwiftRide/codec';
import { withTimeout } from '../devices/ftms/steps';
import { RIDE_REQUEST_OPTIONS } from '../devices/zwiftRide/controller';
import { logExport } from './exportLog';

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
let savedDevices: BluetoothDevice[] = [];
let savedSelect: HTMLSelectElement;
let savedConnectionBusy = false;

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
  let stage = 'requestDevice';
  try {
    if (!navigator.bluetooth) { log('ERROR', 'Web Bluetooth not available (use Chrome or Bluefy over HTTPS)'); return; }
    log('PICK', label);
    if (device?.gatt?.connected) device.gatt.disconnect();
    device = await navigator.bluetooth.requestDevice(opts);
    log('DEVICE', `${device.name ?? '(no name)'} id=${device.id}`);
    device.addEventListener('gattserverdisconnected', () => log('DISCONN', 'gattserverdisconnected'));
    stage = 'connecting GATT';
    log('CONNECT', 'connecting GATT after picker');
    const server = await device.gatt!.connect();
    log('CONNECT', 'GATT connected');
    stage = 'exploring services';
    await explore(server, ride);
  } catch (e) { log('ERROR', `${stage}: ` + (e instanceof Error ? `${e.name}: ${e.message}` : `non-Error rejection: ${JSON.stringify(e)} (${typeof e})`)); }
}

// Match Wattcade's HR picker options: full UUID first, short UUID only on request failure.
async function pickHr() {
  if (!navigator.bluetooth) { log('ERROR', 'Web Bluetooth not available'); return; }
  let selected: BluetoothDevice | undefined;
  try {
    if (device?.gatt?.connected) device.gatt.disconnect();
    for (const svc of ['0000180d-0000-1000-8000-00805f9b34fb', 0x180d]) {
      const opts: RequestDeviceOptions = { filters: [{ services: [svc] }] };
      log('PICK', `HR requestDevice ${JSON.stringify(opts)}`);
      try { selected = await navigator.bluetooth.requestDevice(opts); break; }
      catch (e) {
        log('PICK-ERROR', `requestDevice ${svc}: ` + (e instanceof Error ? `${e.name}: ${e.message}` : `non-Error rejection: ${String(e)} (${typeof e})`));
        if ((e as { name?: string })?.name === 'NotFoundError') return;
      }
    }
    if (!selected) { log('ERROR', 'HR requestDevice failed for both UUID forms; GATT was not attempted'); return; }
    device = selected;
    log('DEVICE', `${device.name ?? '(no name)'} id=${device.id}`);
    device.addEventListener('gattserverdisconnected', () => log('DISCONN', 'gattserverdisconnected'));
    log('CONNECT', 'connecting GATT after HR picker');
    try {
      const server = await withTimeout(device.gatt!.connect(), 8000, 'HR GATT connection');
      log('CONNECT', 'GATT connected');
      await explore(server, false);
    } catch (e) { log('ERROR', `after HR selection: ` + (e instanceof Error ? `${e.name}: ${e.message}` : `non-Error rejection: ${String(e)} (${typeof e})`)); }
  } catch (e) { log('ERROR', `HR picker preparation: ${String(e)}`); }
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

async function checkSavedDevices() {
  if (typeof navigator.bluetooth?.getDevices !== 'function') {
    log('SAVED', 'getDevices() is not exposed by this browser'); return;
  }
  try {
    const devices = await navigator.bluetooth.getDevices();
    savedDevices = devices;
    const selected = savedSelect.value;
    savedSelect.replaceChildren(...devices.map(d => el('option', { value: d.id, textContent: `${d.name ?? '(no name)'} · ${d.id.slice(-6)}` })));
    if (devices.some(d => d.id === selected)) savedSelect.value = selected;
    log('SAVED', `${devices.length} authorized device(s) for ${location.origin}; this is not a scan or a connection check`);
    for (const d of devices) log('SAVED', `${d.name ?? '(no name)'} id=${d.id} connected=${d.gatt?.connected ?? false} gatt.connect=${typeof d.gatt?.connect} events=${typeof d.addEventListener} watchAdvertisements=${typeof d.watchAdvertisements}`);
  } catch (e) { log('SAVED-ERROR', String(e)); }
}

/** Compare direct GATT with advertisement-assisted discovery. Neither opens a chooser. */
async function connectSavedDevice(discover = false) {
  if (savedConnectionBusy) { log('SAVED-ERROR', 'A saved connection test is already running'); return; }
  const saved = savedDevices.find(d => d.id === savedSelect.value);
  if (!saved) { log('SAVED-ERROR', 'Check saved devices first, then select a device'); return; }
  savedConnectionBusy = true;
  let stage = 'preparing saved device';
  try {
    if (device?.gatt?.connected) device.gatt.disconnect();
    device = saved;
    if (discover) {
      stage = 'waiting for advertisement';
      await waitForSavedAdvertisement(saved);
    }
    stage = 'connecting GATT';
    log('SAVED-CONNECT', `${saved.name ?? '(no name)'} id=${saved.id}: connecting GATT without a picker`);
    if (typeof saved.gatt?.connect !== 'function') throw new Error('Saved object has no gatt.connect method');
    await withTimeout(saved.gatt.connect(), 8000, 'saved-device GATT connection');
    log('SAVED-CONNECT', 'GATT connected; compare with Pick HR after disconnecting');
  } catch (e) { log('SAVED-CONNECT-ERROR', `${stage}: ` + (e instanceof Error ? `${e.name}: ${e.message}` : `non-Error rejection: ${String(e)} (${typeof e})`)); }
  finally { savedConnectionBusy = false; }
}

async function waitForSavedAdvertisement(saved: BluetoothDevice) {
  if (typeof saved.watchAdvertisements !== 'function') throw new Error('Saved object has no watchAdvertisements method');
  const abort = new AbortController();
  let onAdvertisement: (event: Event) => void = () => {};
  const received = new Promise<void>(resolve => {
    onAdvertisement = event => {
      const adv = event as Event & { device?: BluetoothDevice; rssi?: number };
      log('ADVERTISEMENT', `received for ${saved.id}; event.device.id=${adv.device?.id ?? '(missing)'} sameObject=${adv.device === saved} rssi=${adv.rssi ?? '(missing)'}`);
      resolve();
    };
    saved.addEventListener('advertisementreceived', onAdvertisement, { once: true });
  });
  try {
    log('ADVERTISEMENT', `calling device.watchAdvertisements({signal}); watchingAdvertisements=${saved.watchingAdvertisements}; waiting up to 10 s`);
    const watching = saved.watchAdvertisements({ signal: abort.signal }).then(() => {
      log('ADVERTISEMENT', `watchAdvertisements resolved; watchingAdvertisements=${saved.watchingAdvertisements}`);
    });
    await withTimeout(Promise.all([watching, received]), 10000, 'saved-device advertisement discovery');
  } finally {
    saved.removeEventListener('advertisementreceived', onAdvertisement);
    abort.abort();
    log('ADVERTISEMENT', 'scan abort requested; advertisement listener removed');
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
  savedSelect = document.createElement('select');
  savedSelect.setAttribute('aria-label', 'Saved device to test');
  savedSelect.style.cssText = 'max-width:100%;padding:10px';
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
    btn('Pick HR', pickHr),
    btn('Send RideOn', sendRideOn),
    btn('Disconnect', () => device?.gatt?.disconnect()),
    btn('Check saved devices', checkSavedDevices),
    savedSelect, btn('Connect selected saved device', () => connectSavedDevice()),
    btn('Discover then connect saved device', () => connectSavedDevice(true)),
    logExport(() => lines.join('\n') + '\n', 'wattcade-probe.txt'),
    btn('Clear', () => { lines.length = 0; logEl.textContent = ''; }),
    parsedEl, logEl, el('h3', { textContent: 'Services / characteristics' }), treeEl,
  );
  log('INFO', `UA: ${navigator.userAgent}`);
  log('INFO', navigator.bluetooth ? 'Web Bluetooth available' : 'Web Bluetooth NOT available');
  log('CAPABILITIES', `secureContext=${window.isSecureContext} origin=${location.origin} requestDevice=${typeof navigator.bluetooth?.requestDevice} getDevices=${typeof navigator.bluetooth?.getDevices}`);
}
build();
