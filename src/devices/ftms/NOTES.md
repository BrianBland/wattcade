# devices/ftms + devices/hr (Agent A)
CONTRACT-REQUEST: none.
## Public API
- `src/devices/ftms/index.ts`: `FtmsTrainer` (static `connect()`, user gesture; implements `TrainerDevice`; also `stats()`, `name`),
  pure codecs `parseIndoorBikeData`, `encodeSetSim/SetPower/SetResistance(raw,'u8'|'s16')/RequestControl/Start`,
  `parseControlPointResponse`, `parseResistanceRange` (real units, 0.1 applied), `parsePowerRange`, `resistancePctToRaw`,
  `ControlPointQueue` (one in-flight write, coalesced per opcode, 3 s timeout), `reconnectLoop`/`backoffDelayS` (legacy exports; adapters use shared Bluetooth lifecycle).
- `src/devices/hr/index.ts`: `HeartRateMonitor` (static `connect()`; implements `HrDevice`; `stats()`), `parseHeartRate`.
- `stats().lastPacketAt` uses `performance.now()` (ms).
## Behavior
- connect: requestDevice -> notifications (CP, bike data) -> Request Control -> Start -> read 0x2AD6/0x2AD8 into `capabilities`.
- Result 0x05 (not permitted): re-request control + start, retry the command once.
- Resistance: uint8 form first; on failure retries as sint16 and remembers. `levelPct` 0..100 maps onto the supported range.
- `apply({mode:'none'})` is a no-op (ok). Superseded (coalesced) commands resolve `{ok:true, detail:'coalesced'}`.
- Bike data samples are merged across split packets; each callback gets the merged latest sample.
- Reconnect reuses the same BluetoothDevice (`gattserverdisconnected`), status via `onStatus` with bounded backoff and progress detail.
- Trainer/HR use shared `../bluetooth/lifecycle`: serialized setup, cancellation, one bounded recovery task.
## Test
`npx vitest run src/devices/ftms src/devices/hr`
## Gaps
- Glue failure/cancel/recovery paths have mock tests; real BLE remains a hardware check.
- Machine Status (0x2ADA) is not subscribed; Feature (0x2ACC) is not read (capabilities assumed sim/erg true).
- Reconnect clears merged samples/ranges, reacquires control, and removes old notification listeners.
## Connect progress / timeouts (added after hardware feedback)
- `HeartRateMonitor.connect(onProgress?: (step: string) => void, onLog?: (line: string) => void)`; instance `onLog(cb)`.
- `FtmsTrainer.connect(onProgress?, onLog?)`, instance `onLog(cb)`.
- Connect deadline 15 s; other native steps 8 s. Initial retry follows cleanup/backoff; final failure closes the adapter.
- HR: listener added before startNotifications, which is raced with the first beat; connected only after a valid beat (15 s wait).
- FTMS connect succeeds even if Request Control is refused: status `{connected:true, detail:'Trainer control refused — close Zwift, then reconnect'}`; each `apply()` re-requests control while not held, and status is re-emitted without detail once granted.
- Trainer/HR `connectDevice(device, onProgress?, onLog?)` uses an authorized object without a picker; `id` exposes the selected ID for saved setup.
- Compatible KICKRs discover/enable native shifting on the same GATT connection; missing service/permission uses FTMS-only. Failed setup reconnects before fallback.
- apply serializes FTMS + native writes, coalesces the latest pending command, reapplies ratios after hills/ERG, and invalidates queued work on reconnect.
