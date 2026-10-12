# KICKR CORE native shifting hardware test

Open the PR preview's `/shift-probe.html` in Bluefy over HTTPS. Close Zwift and
other Wattcade tabs first. The probe is separate from the arcade and sends no
trainer commands until you press a command button. Use the same preview hostname
throughout; Bluetooth permissions belong to that origin.

1. **Connect KICKR** and select your CORE. The log records model/firmware where
   available, the native service, and raw native/FTMS responses and bike telemetry.
2. **Enable native shifting** sends the CORE v1 `RideOn 01 02` handshake. A
   successful GATT write is not proof that the trainer accepted the protocol.
3. Start pedalling gently. **Send selected gear** starts with gear 12 (2.40).
   Compare gear 10 (2.04), 12 (2.40), and 14 (2.82) at similar cadence. Higher
   ratios should feel harder. The probe uses the supplied 24-ratio table; this
   table has not been verified as an official Zwift preset.
4. At gear 12, try **FTMS hill 0%**, then **FTMS hill 2%**. Each button requests
   control/start when needed and waits for the FTMS success response. Compare
   pedal feel, **Read ratio**, and resend gear 12. Does the hill command reset or
   disable shifting? Compare gears 10 and 14 again at 2%.
5. Return to **FTMS hill 0%**, then **Disconnect**. Reconnect, enable shifting,
   and send gear 12 again to test the complete lifecycle.
6. **Download log** and report CORE model/firmware, Bluefy/iPad version, whether
   shifts changed pedal feel, and whether FTMS hills preserved that behavior.

The log keeps the most recent 6000 lines. Native responses are raw bytes, not
claimed gear acknowledgements. The screen shows the requested gear, not a
confirmed trainer gear. No commands are sent automatically on reconnect.

This tests an independently implemented, reverse-engineered CORE v1 protocol:
https://github.com/csanz91/kickr_esp32. CORE 2/newer variants are not implemented.
Errors disconnect GATT to prevent later commands overlapping an uncertain write.
Disconnect does not promise to restore trainer state; power-cycle the trainer
if needed before returning to the arcade. The game's existing 11 gradient-based
gears remain unchanged pending this hardware result.
