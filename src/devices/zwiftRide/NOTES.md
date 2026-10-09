# Ride saved setup
- `RideControllerGroup.ids` exposes both registered peripheral IDs.
- `addDevice(device)` adds an authorized peripheral without opening a picker.
- `addFromPicker()` delegates to it; duplicate IDs are rejected.
- Existing controller handshake/reconnect logic is unchanged.
- Tests: `npx vitest run src/devices/zwiftRide`.
- Verify both same-name Ride sides reconnect on Bluefy after reload/restart.
