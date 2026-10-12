# Native shifting experiment
- Pure CORE v1 encoder, implemented from protocol facts, without copying reference code.
- Reference: https://github.com/csanz91/kickr_esp32 (hello RideOn 01 02, HubCommand 04, physical field 5, ratio field 2 scaled by 10000).
- `/shift-probe.html` is opt-in; no arcade, mixer, or controller behavior changes.
- The 24 ratios come from the requested table, not a verified official Zwift preset.
- CORE 2/newer protocol variants are not implemented. No claim of hardware compatibility until tested.
- Tests cover handshake, ratio request, gear bounds, and every ratio's encoding.
