# BLE capability check
- `/probe.html` logs secure context, origin, and requestDevice/getDevices method availability at startup.
- Check saved devices lists authorized IDs without a picker, scan, or GATT connection.
- Repeat on the same origin after reload/relaunch to measure permission persistence.
- Tests: `npx vitest run src/probe`; typecheck and build.
- Saved-device diagnostics report gatt.connect/addEventListener types to verify returned objects support reconnect on Bluefy.
- Check saved devices fills a selector; Connect selected saved device tests GATT directly with an 8 s timeout and reports bare native rejections. Compare with Pick HR on the same origin.
- Pick HR matches the app: full HR UUID with no optional services, then short UUID on request failure; logs picker failures separately from GATT.
