# First real ride — hardware checklist (~15 min)

Gear: iPad with **Bluefy**, KICKR CORE on the Zwift Ride frame, Zwift Ride controllers, Garmin watch.
Keep a note open and write down anything marked **record**.

## 0. Before you start (2 min)
- [ ] `npm run deploy` has run and the site loads over **HTTPS** (Pages URL or custom domain).
- [ ] **Close Zwift** (and any other trainer app) on the iPad and every other nearby device. FTMS control is single-owner.
- [ ] Do **not** update the Ride controller firmware through Zwift. Firmware ≥ 1.3 locks the controller to Zwift.
- [ ] Garmin: enable **Broadcast Heart Rate**. If you want a Garmin/Strava record, also start an Indoor Bike activity on the watch.

## 1. Open and profile (1 min)
- [ ] Open the site in Bluefy and create or select a profile with your real FTP, max HR and weight.

## 2. Trainer (4 min)
- [ ] Connect → **Trainer** → pick the KICKR. The status turns connected.
- [ ] Toggle the debug overlay with the `` ` `` key on a keyboard, a triple-tap in the top-left corner, or by holding both powerUp buttons for 1 s.
- [ ] Pedal. In the **DEVICES** panel, power, cadence and speed should be live, `pkt/s trn` should be about 1–4, and `pkt age` should stay below 1 s. **Record:** does the cadence look right (not doubled or halved)?
- [ ] Start any game. In the **MIXER → TRAINER TEST** panel, try each button for about 10 s and **record** whether you feel it and the `result` code shown:
  - [ ] `0% grade`, then `5% grade`. 5 % should feel clearly harder.
  - [ ] `150 W`, then `200 W` (ERG). Power should converge on the target within a few seconds.
  - [ ] `20% level`, then `50% level`. If it fails, **record** the result code; the code retries in sint16 form automatically.
  - [ ] Press `clear` afterwards.
- [ ] Press **PANIC**. Resistance should drop to flat, and `release` restores it.

## 3. Controller (3 min)
- [ ] Connect → **Controller** → pick "Zwift Ride". **Record** the firmware and battery shown, and any warning.
- [ ] In the **CONTROLLER** panel, press every button. Each one should light the matching cell, and nothing else should stay lit at rest. **Record** any button that is wrong, stuck or missing.
- [ ] Move each paddle. **Record** the raw rest value, the raw value at full travel, and the direction for L and R. If a direction feels backwards, set "Invert left/right paddle" in the profile editor. If the rest value isn't 0, raise the deadzone.
- [ ] Tap both powerUp buttons together to **pause**, and hold them together for 1 s to **toggle debug**.
- [ ] If anything looks wrong, open **`/probe.html`**: Pick Zwift Ride → Send RideOn → press buttons → **Download** the hex log and keep it.

## 4. Heart rate (1 min)
- [ ] Connect → **Heart rate** → pick the watch. `hr` should be live in the DEVICES panel, and the `hrZone` in DERIVED should look plausible.

## 5. Games (3 × ~3 min)
- [ ] **Crank Crawler:** pedal to move and fire, aim with the paddles, and step on swamp tiles (green). **Record:** is the grade change noticeable? Does the 90 rpm movement speed feel right?
- [ ] **Keeper's Light:** ride in Zone 2. The lamp should brighten and the fog should fall. Build something with the D-pad + A.
- [ ] **Dynamo Defense:** switch weapons with A/B/Y. The trainer should go sim → resistance → ERG. **Record** whether each switch is felt and whether the ERG/resistance transitions are smooth.
- [ ] Throughout, watch the debug overlay for result codes other than `ok 1`, a growing `pkt age`, or reconnect messages.

## 6. Wrap-up (1 min)
- [ ] Quit to summary. Duration, power, kJ and HR should look right, and XP should be awarded.
- [ ] Reload the page. The profile, level and achievements should persist.
- [ ] Export a backup from the profile editor, because Bluefy storage can be cleared.

**Report back:** the recorded items above, the probe log if one was captured, and which of the sim, ERG and resistance tests were felt.
