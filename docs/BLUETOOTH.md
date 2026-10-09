# Bluetooth lifecycle and iPad verification

Wattcade connects directly to BLE peripherals in Bluefy on iPad. Saved IDs belong to
this browser and origin, independently of player profiles. Only one HR watch is active;
the saved watch pool retains other household watches, with the last-used first.

## Connection flow

1. On startup, feature-detect `getDevices()` and resolve saved IDs against authorized
   objects. Missing grants offer manual selection. Startup never opens a picker.
2. Restore HR first, then trainer, then both controller sides. When available,
   `watchAdvertisements()` waits up to 10 seconds for fresh discovery before saved
   GATT setup; scanning is aborted and listeners removed on success/failure/cancel.
3. A shared queue coordinates discovery and complete setup transactions across roles,
   including manual connections and recovery. Picker calls remain in the user gesture;
   canceling a replacement picker preserves the existing connection.
4. Each adapter freshly discovers services/characteristics, subscribes, and performs
   its protocol setup. GATT connect has a 15-second deadline; other native setup steps
   have 8 seconds. HR additionally waits up to 15 seconds for a valid measurement.
   Bluefy's subscription promise may remain pending while measurements arrive, so
   the first valid beat can satisfy subscription readiness; both outcomes are logged.
5. Initial setup retries once, after disconnect cleanup, a 500-ms cancellation grace,
   and 2-second backoff. Final factory failure closes the adapter and removes listeners.
6. An unexpected disconnect starts at most one recovery sequence per adapter: four
   attempts after 2/4/8/15 seconds, through the same queue. Recovery re-discovers GATT
   objects, resets trainer control, and removes old listeners. Exhaustion enables manual
   retry. Offline Ride sides don't retain held inputs or count as connected; selecting
   an offline side again replaces its old adapter while retaining the working side.
7. Cancel/disconnect invalidates ownership before native disconnect; stale results
   cannot publish connected status or attach to DataHub. Cancellation also covers roles
   waiting for startup permissions, scans, queued setup, recovery, and Add other side.

Timeout is a deadline for the application, not proof of native cancellation. On failed
setup the queue waits up to two seconds for outstanding operations, then 500 ms for
bridge cleanup. An unresolved `gatt.connect()` stays tracked by device ID: a subsequent
attempt waits up to five seconds and fails without issuing another connect if the old
promise still hasn't settled. Other devices can proceed after that bounded wait.
Notifications and ordinary trainer commands remain concurrent across devices; trainer
control-point commands retain their existing per-device queue. Native hardware behavior
cannot be proven by these promise-level guarantees.

## Documentation versus observations

| Evidence | Consequence |
| --- | --- |
| [Web Bluetooth GATT specification](https://bluetooth.spec.whatwg.org/#bluetoothremotegattserver) describes Bluetooth-system-busy failures and recommends serialized connect requests; disconnect aborts active GATT algorithms. | Coordinate setup, explicitly disconnect failed attempts, and guard all async results. |
| [Chrome Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth) recommends queuing GATT operations and obtaining fresh service/characteristic objects after reconnecting. | Re-run adapter setup with fresh objects; retain the FTMS command queue. |
| [Chrome advertisement/connect sample](https://googlechrome.github.io/samples/web-bluetooth/watch-advertisements-and-connect.html) discovers saved devices via advertisements before connecting. | Keep this feature-detected sequence, previously observed to work after a Bluefy reload. |
| [Chrome reconnect sample](https://googlechrome.github.io/samples/web-bluetooth/automatic-reconnect.html) uses bounded retry and exponential backoff. | Use one recovery task with a finite retry budget. |
| [Apple cancelPeripheralConnection](https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/cancelperipheralconnection(_:)) is nonblocking and may not physically disconnect a peripheral used elsewhere. | A JavaScript timeout or returned disconnect call does not establish that the native bridge has settled. |

Bluefy's bare numeric rejection `2` has no verified app-specific meaning in the
[Bluefy guide](https://bluefy.app/guide.html). Do not label it as an Apple/CoreBluetooth
error without a domain/code mapping. The watch-only iPhone success and four-device iPad
failure suggest contention or stale native work, but neither proves a four-device limit
nor identifies the watch or browser as the cause. The queue, cleanup, and stale-result
regressions are covered by mock tests; resolution of the observed iPad failure remains
an on-device test.

## Short hardware test

Record iPad/iPhone model, iOS/Bluefy versions, watch firmware and broadcast mode. Close
other apps using these peripherals, wake the trainer/controllers, and enable HR broadcast.

1. Authorize the watch, trainer, and both sides. Verify live HR and trainer readings and
   both sides' inputs. Reload three times; then quit/reopen Bluefy three times. Saved
   setup should connect without a picker, and the log should show sequential setup.
2. With all four active, disconnect/reconnect HR and switch between the two saved
   watches five times. Cancel Add watch's picker once: the active watch should remain.
   Compare the same sequence on the watch-only iPhone if error `2` recurs.
3. Stop HR broadcast, request a saved connection, and cancel while scanning/connecting.
   Re-enable broadcast and retry. No old attempt should mark the watch connected. Stop
   broadcast through recovery exhaustion and verify the busy state clears for retry.
4. Power off one Ride side while holding a button/paddle. Inputs should clear for that
   side while the other remains usable. After recovery exhaustion, Add other side may
   select the offline saved side again. Cancel a connection queued during startup and
   verify it stays canceled after the other roles finish.
5. After any failure, choose **Download Bluetooth log** before reloading. Capture the
   visible error and whether a picker appeared. The last 600 log lines include timestamps,
   role, device IDs/names, attempt IDs, setup steps, native rejections, cancellation, late
   results and first HR data. Logs remain in memory and are only exported on request;
   they include device identifiers and browser/origin metadata but no HR sample values.

Acceptance: valid HR on each successful connection, no repeated picker for retained
permissions, no overlapping GATT connects to a still-pending device, no orphan retry
after cancellation, no stuck busy state after exhaustion, and usable surviving devices.
