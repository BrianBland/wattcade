# BLE capability check
- `/probe.html` logs secure context, origin, and requestDevice/getDevices method availability at startup.
- Check saved devices lists authorized IDs without a picker, scan, or GATT connection.
- Repeat on the same origin after reload/relaunch to measure permission persistence.
- Tests: `npx vitest run src/probe`; typecheck and build.
