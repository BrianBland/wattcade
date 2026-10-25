# Native shifting experiment
- Bluefy picker uses a KICKR name filter and full 128-bit UUID strings, avoiding numeric optional-service rejection (`2`) before the native picker opens.
- Pure CORE v1 encoder, implemented from protocol facts, without copying reference code.
- Reference: https://github.com/csanz91/kickr_esp32 (hello RideOn 01 02, HubCommand 04, physical field 5, ratio field 2 scaled by 10000).
- FTMS discovers native support automatically on compatible KICKRs; grants full UUID services during the picker. Saved permissions may need re-selection.
- Shared mixer uses 24 ratios without gradient offsets. Default gear 12, panic gear 1, ERG watts unchanged; unsupported/fake trainers keep 11 gradient gears.
- `/shift-probe.html` remains available for diagnostics. Copy/Share/selectable text supplement blob downloads in Bluefy.
- The 24 ratios come from the requested table, not a verified official Zwift preset.
- CORE 2/newer protocol variants are not implemented. No claim of hardware compatibility until tested.
- Tests cover handshake, ratio request, gear bounds, and every ratio's encoding.

