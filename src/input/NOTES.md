# Agent B notes: input, Ride controller, probe

CONTRACT-REQUESTs: none.

## Public API
- `src/input/index.ts`: `InputHub`, `ScriptedInput`, `applyDeadzone`, key maps, `DEBUG_*_STEP`. Exactly the CLAUDE.md seam. Extras: `attachGamepad(getPads?)` (injectable for tests), `showTouch(bool)` / `touchVisible` (touch overlay hidden by default), `onDebugAdjust`.
- `src/devices/zwiftRide/index.ts`: `ZwiftRideController` (`static connect()`, `onState/onStatus/onLog`, `stats()`, `sendRideOn()`, `disconnect()`), `parseRideMessage`, `buttonsFromMap`, `PolarityDetector`, `firmwareAtLeast`, `pickCharacteristics`.
- `probe.html` + `src/probe/main.ts` (+ pure `format.ts`): standalone page; Pick any/Ride/FTMS/HR, Send RideOn, live parsed buttons/paddles, hex log with Copy/Download.

## Behavior decisions
- `parseRideMessage` status: `buttonMapRaw` is `number | null` (null = field absent; consumers keep prior buttons). Missing paddle entry = 0 (proto3 omits zeros). Truncated/malformed -> `{kind:'other', malformed:true}`. Battery (0x19) field layout is unverified (field 2, fallback field 1); capture real bytes with the probe.
- Edges: every source change calls `recompute()`, which records pressed/released into pending sets; `beginTick` publishes and clears them, so sub-tick taps are never lost (a tap can be in pressed+released with held false).
- Paddles: ride raw -100..100 -> deadzone (profile `paddleDeadzone`) then rescaled to -1..1, invert applied to ride only. Keyboard/gamepad/script paddles are already -1..1; the largest magnitude across sources wins. `paddleIdleS` resets when either paddle is nonzero.
- `ScriptedInput` clock starts at 0 on `setScript`, advances in `beginTick`; paddle values -1..1 (|v|>1 treated as -100..100). Source reports 'script'.
- System combos (SPEC 3.1, evaluated on the merged held set of all sources, so they work while paused): powerUpL+powerUpR tapped (<1 s) -> pause; held >= 1 s -> toggleDebug (fires from beginTick/setControllerState, never also pause). powerUp buttons are hidden from state() while part of a combo. No shifter/onOff combos. Keyboard: Esc pause, ` toggleDebug, 0 panic. Touch: triple-tap top-left 60x60 -> toggleDebug. `new InputHub({now})` injects the clock (default performance.now).
- `debugOpen=true`: shifters are removed from state() and emit `onDebugAdjust`: left shifters -> difficulty +/-0.05; right shifters -> timeScale +/-1 (a step; shell interprets).
- Keyboard map (SPEC 3.1): arrows dpad, K/L/I/J = a/b/y/z, Q/A shiftUp/DnL, P/; shiftUp/DnR, 1/2 powerUpL/R, N/M left paddle -/+, ,/. right paddle. Gamepad: d-pad 12-15, faces 0/1/3/2 = A/B/Y/Z, LB/RB shiftUp L/R, LT/RT shiftDn L/R, Select/Start powerUp L/R, stick x -> paddles. Ignored while typing in inputs.
- Controller: reconnect with 1,2,4,8,15s backoff on `gattserverdisconnected`; firmware >= 1.3.0 sets `warning` in status; polarity auto-flip logged via `onLog`.
- No new runtime deps.

## Testing
`npx vitest run src/input src/devices/zwiftRide src/probe` (touch test uses jsdom). Web Bluetooth glue (`controller.ts`, `probe/main.ts`) is untested; needs real hardware.

## Known gaps
Real paddle rest values/direction unknown (settings + probe exist for this). Touch overlay layout is basic.
