// Standalone hardware experiment: never imported by the arcade.
import { SHIFT_SERVICES, SHIFT_CHARS, GEAR_RATIOS, encodeShiftHello, encodeGear, encodeRatioQuery } from '../devices/zwiftTrainer/codec';
import { FTMS_SERVICE, CHAR, encodeRequestControl, encodeStart, encodeSetSim, parseControlPointResponse, parseIndoorBikeData } from '../devices/ftms/codec';
import { withTimeout } from '../devices/ftms/steps';
import { toHex } from './format';

const root = document.getElementById('shift-probe')!;
root.style.cssText = 'font:16px system-ui;max-width:900px;margin:auto;padding:16px';
const status = document.createElement('p');
const output = document.createElement('pre');
output.style.cssText = 'background:#111;color:#9f9;padding:12px;max-height:440px;overflow:auto;white-space:pre-wrap';
const telemetry = document.createElement('p');
const gear = document.createElement('select');
gear.setAttribute('aria-label', 'Virtual gear');
GEAR_RATIOS.forEach((ratio, i) => gear.add(new Option(`Gear ${i + 1} · ${ratio.toFixed(2)}`, String(i + 1))));
gear.value = '12';
let device: BluetoothDevice | undefined;
let writer: BluetoothRemoteGATTCharacteristic | undefined;
let control: BluetoothRemoteGATTCharacteristic | undefined;
let busy = false, initialized = false, hasControl = false;
let pending: ((v: DataView) => void) | undefined;
const cleanups: Array<() => void> = [];
const actions: HTMLButtonElement[] = [];
let connectButton: HTMLButtonElement;
let disconnectButton: HTMLButtonElement;
const logs: string[] = [];
function log(tag: string, message: string) {
  logs.push(`${new Date().toISOString()} ${tag} ${message}`);
  if (logs.length > 6000) logs.shift();
  output.textContent = logs.join('\n'); output.scrollTop = output.scrollHeight;
}
function refresh() {
  connectButton.disabled = busy || !!device?.gatt?.connected;
  disconnectButton.disabled = busy;
  actions.forEach(b => { b.disabled = busy || !writer || !device?.gatt?.connected; });
  gear.disabled = busy || !writer;
}
function reset() {
  cleanups.splice(0).forEach(fn => fn());
  writer = undefined; control = undefined; pending = undefined;
  initialized = hasControl = false;
  status.textContent = 'Disconnected. Reconnect and enable native shifting again.';
  refresh();
}
function disconnect() { device?.gatt?.disconnect(); reset(); }
async function run(fn: () => Promise<void>) {
  if (busy) return;
  busy = true; refresh();
  try { await fn(); }
  catch (e) {
    log('ERROR', String(e));
    // A timed-out native write cannot be cancelled. Close GATT before allowing another.
    disconnect();
  } finally { busy = false; refresh(); }
}
function button(label: string, fn: () => void, requiresConnection = true) {
  const b = document.createElement('button'); b.textContent = label; b.onclick = fn;
  b.style.cssText = 'padding:12px;margin:4px;font-size:16px';
  root.append(b); if (requiresConnection) actions.push(b); return b;
}
async function subscribe(c: BluetoothRemoteGATTCharacteristic, listener: (v: DataView) => void) {
  const onValue = () => { if (c.value) listener(c.value); };
  c.addEventListener('characteristicvaluechanged', onValue);
  cleanups.push(() => c.removeEventListener('characteristicvaluechanged', onValue));
  await withTimeout(c.startNotifications(), 8000, `subscribe ${c.uuid}`);
}
async function write(c: BluetoothRemoteGATTCharacteristic, bytes: Uint8Array) {
  log('WRITE', `${c.uuid} ${toHex(bytes)}`);
  const data = bytes as BufferSource;
  const work = c.properties.write
    ? (typeof c.writeValueWithResponse === 'function' ? c.writeValueWithResponse(data) : c.writeValue(data))
    : c.writeValueWithoutResponse(data);
  await withTimeout(work, 5000, 'Bluetooth write');
  log('WRITE-OK', 'GATT write completed; this alone does not confirm the trainer applied the command');
}
async function connect() {
  if (!navigator.bluetooth) throw new Error('Use Bluefy over HTTPS or desktop Chrome with Web Bluetooth');
  // Match the name-filter/full-UUID shape already used by the Ride controller.
  const options: RequestDeviceOptions = {
    filters: [{ namePrefix: 'KICKR' }],
    optionalServices: ['00001826-0000-1000-8000-00805f9b34fb', ...SHIFT_SERVICES, '0000180a-0000-1000-8000-00805f9b34fb'],
  };
  log('PICK', JSON.stringify(options));
  try { device = await navigator.bluetooth.requestDevice(options); }
  catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : `non-Error rejection: ${String(e)} (${typeof e})`;
    throw new Error(`Bluetooth picker failed before GATT connection: ${detail}`);
  }
  log('DEVICE', `${device.name ?? '(unnamed)'} ${device.id}`);
  const onDisconnect = () => { log('DISCONNECT', 'GATT disconnected'); reset(); };
  device.addEventListener('gattserverdisconnected', onDisconnect);
  const selectedDevice = device;
  cleanups.push(() => selectedDevice.removeEventListener('gattserverdisconnected', onDisconnect));
  const server = await withTimeout(device.gatt!.connect(), 8000, 'GATT connection');
  let service: BluetoothRemoteGATTService | undefined;
  for (const uuid of SHIFT_SERVICES) {
    try { service = await withTimeout(server.getPrimaryService(uuid), 5000, `service ${uuid}`); break; }
    catch (e) { log('SERVICE', `${uuid}: ${String(e)}`); }
  }
  if (!service) throw new Error('No native shifting service found; check CORE model and firmware');
  log('SERVICE', service.uuid);
  writer = await withTimeout(service.getCharacteristic(SHIFT_CHARS.write), 5000, 'shift characteristic');
  if (!writer.properties.write && !writer.properties.writeWithoutResponse) throw new Error('Native characteristic is not writable');
  for (const uuid of [SHIFT_CHARS.response, SHIFT_CHARS.data]) {
    const c = await withTimeout(service.getCharacteristic(uuid), 5000, `characteristic ${uuid}`);
    await subscribe(c, value => log('NATIVE-RX', `${uuid} ${toHex(value)}`));
  }
  try {
    const ftms = await withTimeout(server.getPrimaryService(FTMS_SERVICE), 5000, 'FTMS service');
    control = await withTimeout(ftms.getCharacteristic(CHAR.controlPoint), 5000, 'FTMS control');
    await subscribe(control, value => { log('FTMS-RX', toHex(value)); pending?.(value); });
    const bike = await withTimeout(ftms.getCharacteristic(CHAR.indoorBikeData), 5000, 'bike data');
    await subscribe(bike, value => {
      log('BIKE-RX', toHex(value));
      const sample = parseIndoorBikeData(value);
      telemetry.textContent = JSON.stringify(sample);
    });
  } catch (e) { control = undefined; log('FTMS-UNAVAILABLE', String(e)); }
  try {
    const info = await withTimeout(server.getPrimaryService(0x180a), 5000, 'device info');
    for (const uuid of [0x2a24, 0x2a26]) {
      const c = await withTimeout(info.getCharacteristic(uuid), 5000, 'model/firmware');
      const value = await withTimeout(c.readValue(), 5000, 'model/firmware read');
      log('DEVICE-INFO', `${uuid.toString(16)} ${new TextDecoder().decode(value)}`);
    }
  } catch (e) { log('DEVICE-INFO', String(e)); }
  status.textContent = 'Connected. Enable native shifting, then send a gear. Responses are logged as raw bytes.';
}
async function ftmsCommand(bytes: Uint8Array) {
  if (!control) throw new Error('FTMS control unavailable on this connection');
  let accept: (v: DataView) => void = () => {};
  const response = new Promise<void>((resolve, reject) => {
    accept = v => {
      const r = parseControlPointResponse(v);
      if (r?.requestOpcode === bytes[0]) {
        if (r.ok) resolve(); else reject(new Error(`FTMS opcode ${bytes[0]} rejected: result ${r.result}`));
      }
    };
  });
  pending = accept;
  // Attach rejection handlers before writing; notifications can arrive before write completion.
  try { await Promise.all([withTimeout(response, 5000, 'FTMS acknowledgement'), write(control, bytes)]); }
  finally { pending = undefined; }
}
async function sendGear() {
  if (!initialized) throw new Error('Enable native shifting first');
  const selected = Number(gear.value);
  await write(writer!, encodeGear(selected));
  status.textContent = `Requested gear ${selected}, ratio ${GEAR_RATIOS[selected - 1]}. Verify pedal feel and native responses.`;
  await write(writer!, encodeRatioQuery());
}
root.innerHTML = '<h1>Native shifting test</h1><p>Close Zwift and other Wattcade tabs. Connect your KICKR CORE, enable native shifting, then send a gear while pedalling gently. This tests the CORE protocol; support on your firmware is unverified.</p>';
root.append(status);
connectButton = button('Connect KICKR', () => void run(connect), false);
button('Enable native shifting', () => void run(async () => {
  await write(writer!, encodeShiftHello()); initialized = true;
  log('HELLO', 'CORE v1 handshake sent; inspect responses and test a gear to verify support');
}));
root.append(gear);
button('Send selected gear', () => void run(sendGear));
button('Read ratio', () => void run(async () => { await write(writer!, encodeRatioQuery()); }));
for (const grade of [0, 2, 5]) button(`FTMS hill ${grade}%`, () => void run(async () => {
  if (!hasControl) { await ftmsCommand(encodeRequestControl()); await ftmsCommand(encodeStart()); hasControl = true; }
  await ftmsCommand(encodeSetSim(grade));
  log('HILL', `${grade}% accepted. Check whether gearing still works; read ratio and resend the same gear to compare.`);
}));
disconnectButton = button('Disconnect', disconnect, false);
button('Download log', () => {
  const url = URL.createObjectURL(new Blob([logs.join('\n')], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = 'wattcade-native-shifting.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}, false);
root.append(telemetry, output);
log('BROWSER', `${navigator.userAgent} secure=${window.isSecureContext}`);
status.textContent = 'Disconnected'; refresh();

