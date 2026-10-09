# devices/ftms + devices/hr (Agent A)

CONTRACT-REQUEST: none.

## Public API
- `src/devices/ftms/index.ts`: `FtmsTrainer` (static `connect()`, user gesture; implements `TrainerDevice`; also `stats()`, `name`),
  pure codecs `parseIndoorBikeData`, `encodeSetSim/SetPower/SetResistance(raw,'u8'|'s16')/RequestControl/Start`,
  `parseControlPointResponse`, `parseResistanceRange` (real units, 0.1 applied), `parsePowerRange`, `resistancePctToRaw`,
  `ControlPointQueue` (one in-flight write, coalesced per opcode, 3 s timeout), `reconnectLoop`/`backoffDelayS` (1,2,4,8,15 s).
- `src/devices/hr/index.ts`: `HeartRateMonitor` (static `connect()`; implements `HrDevice`; `stats()`), `parseHeartRate`.
- `stats().lastPacketAt` uses `performance.now()` (ms).

## Behavior
- connect: requestDevice -> notifications (CP, bike data) -> Request Control -> Start -> read 0x2AD6/0x2AD8 into `capabilities`.
- Result 0x05 (not permitted): re-request control + start, retry the command once.
- Resistance: uint8 form first; on failure retries as sint16 and remembers. `levelPct` 0..100 maps onto the supported range.
- `apply({mode:'none'})` is a no-op (ok). Superseded (coalesced) commands resolve `{ok:true, detail:'coalesced'}`.
- Bike data samples are merged across split packets; each callback gets the merged latest sample.
- Reconnect reuses the same BluetoothDevice (`gattserverdisconnected`), status via `onStatus` (`detail` = "reconnect #n in Xs").
- HR reconnect imports `reconnectLoop` from `../ftms/reconnect`.

## Test
`npx vitest run src/devices/ftms src/devices/hr`

## Gaps
- Web Bluetooth glue (`trainer.ts`, `monitor.ts`) is untested (no BLE in CI); verify on hardware.
- Machine Status (0x2ADA) is not subscribed; Feature (0x2ACC) is not read (capabilities assumed sim/erg true).
- Reconnect does not clear stale `latest` merged sample.

## Connect progress / timeouts (added after hardware feedback)
- `HeartRateMonitor.connect(onProgress?: (step: string) => void, onLog?: (line: string) => void)`; instance `onLog(cb)`.
- `FtmsTrainer.connect(onProgress?, onLog?)`, instance `onLog(cb)`.
- Steps are 8 s timeouts (`steps.ts`: `withTimeout`, `setupWithRetry`); whole setup retried once after gatt.disconnect(); final error names the stuck step.
- HR: listener added before startNotifications, which is raced with the first beat; connected once subscribed (no beat wait).
- FTMS connect succeeds even if Request Control is refused: status `{connected:true, detail:'Trainer control refused — close Zwift, then reconnect'}`; each `apply()` re-requests control while not held, and status is re-emitted without detail once granted.

- Trainer/HR `connectDevice(device, onProgress?, onLog?)` uses an authorized object without a picker; `id` exposes the selected ID for saved setup.
