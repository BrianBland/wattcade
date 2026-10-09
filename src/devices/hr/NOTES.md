# Heart rate saved setup
- `connect()` still requires a picker gesture.
- `connectDevice(device, onProgress?, onLog?)` connects an already-authorized device.
- `id` exposes the selected device ID for browser-local saved setup.
- Existing GATT setup and reconnect behavior is shared by both entry points.
- Validate on Garmin broadcast / iPad Bluefy.
- Tests: `npx vitest run src/devices/hr`.
- `bluetoothDevice` exposes the authorized object for saved-watch switching.
- Initial setup cleanup does not trigger reconnect; final failure stops/removes listeners so the next saved watch can be attempted safely.
- `monitor.test.ts` verifies failed setup leaves no reconnect timer/listener.
