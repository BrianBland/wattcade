# HAMSTERGRID (hamster)

CONTRACT-REQUESTs: none. Also touched `src/games/registry.ts` (added the module).

## Layout
- `sim/data.ts`: content (24 generators in 8 eras, 5 upgrades each, legs, boredom upgrades, specials, peptides, vibes, news, units).
- `sim/econ.ts`: pure math: generator i outputs `out0·outStep^i` W and costs `cost0·costStep^i·growth^owned`. Also `fmtJ/fmtW`, Kardashev rating `(log10 W − 6)/10`, and "≈ N toasters".
- `sim/sim.ts`: `createHamsterSim(ctx, { autopilot?, preset?: { gens, bank } })`. The renderer gets `send({type:'tab'|'row'|'accept'|'inject', i})`.
- `render/draw.ts`: primitives (rounded rects, shaded hamster with run cycle, 3D-ish wheel). `render/scenes.ts`: one scene per era plus Gerald Cam. `render/renderer.ts`: glass HUD cards, shop panel (icons, cost pills, ETA, afford bars), events, toasts, ticker, particles, vibes, sfx cues.

## Rules (all numbers are `hamster.*` tunables)
- Output = (hamsters × zoneEff × union gate + your watts × 2^legs) × Mind-Numbing × milestones (+1% each) × karmic seeds (+5% each) × active effects.
- Union rule: hamsters produce nothing when cadence3s < `unionCadence` (35 rpm). There is no offline progress.
- Mind-Numbing: builds `monoGainPerMin` in steady Z2 (40% rate if cadence wobbles more than `steadyRpm`). Decays below or above Z2. Frozen during events and BPC-157. Cap is 2 plus boredom upgrades (max 10).
- Golden hamster every 150–300 s, 25 s window, 6 s at Z4+ to catch → frenzy ×7, lucky lump, quad storm (legs ×777), or a free vial.
- Short events (golden, strike, rage) use `max(effortZone, powerZone)` because HR lags too much, and their `hud().targetZone` has `source: 'power'` so the shell bar switches to power and shows the watts needed.
- Spin class (unlocks at 5 hamsters, every 6–10 min): 45 s window, 20 s at ≥ `spinRpm` (95) → hamsters ×3 for 90 s. `targetCadence` drives the HUD rpm chip (also 50 rpm during trials; none otherwise).
- Strikes (era ≥ 2, every 15–25 min): 20 s warning, then 60 s with hamsters at 10% and +3% grade (`strike` effect). 35 s at Z3+ breaks the strike → ×3 hamsters for 3 min plus a lump.
- Clinical trials (era ≥ 3, every 20–30 min): offer (Z to accept) → 180 s ERG at 0.8 FTP (`trial` effect, priority 2) → lump + free peptide.
- Peptides: costs scale with the current rate. Tolerance (+1 per use, −1 per 8 min) shrinks the bonus. Trenbalone has a 30% chance of roid rage (hamsters at −25%; sprint Z4+ for 8 s).
- Resistance: sim mode, `inertia` effect adds +0.15% grade per era, virtual gears on both hoods.
- Reincarnation: seeds = floor(cbrt(lifeEnergy / 1e27)). Requires a double press. Keeps vibes, milestones and unlocks.
- Autobuyers (specials): Middle Manager buys generators and HR buys upgrades, each spending ≤ 25% of the bank.
- Controls: ◀▶ tab, ▲▼ row, A buy/toggle, B buy ×10, Y re-dose the last peptide, Z accept trial; shifters are gears. Tap a tab or row (tap again to buy).
- Save `HamsterSave` v1 via ctx.save: every 30 s, 3 s after a purchase, and on dispose.

## Balance (autopilot greedy buyer, z2 = 0.65 FTP of 200 W, no sprints/peptides)
- Era 1 at 10 min, era 2 at 1.1 h, era 3 at 2.9 h, era 4 at 4 h, era 5 at 5.3 h, era 6 (Star) at 7.2 h, Dyson Swarm Wheel at 8.6 h, galaxy at 9 h, Kardashev 2 at 10.4 h.
- Re-run: `npx tsx src/games/hamster/test/balance.ts 14 z2` (about 30 s).

## Testing
`npx vitest run src/games/hamster`: econ, buy/union/mono/save/market/rebirth via a scripted pad, and the 7 scenarios.

## Known gaps
- Visuals were checked with throwaway Playwright screenshots (desktop Chromium), not on the iPad. Icons are emoji (render as color on iOS). Font is ui-rounded (SF Pro Rounded on iOS), falling back to system-ui.
- No new sfx: it reuses `src/audio/sfx.ts` names.

- HUD insets: `render/layout.ts` lays scene + panel out above `insets.bottom` (tested); the last pixel rows are stretched under the HUD band so backgrounds stay full-bleed.

Save boundary: `sim/save.ts` registers an independent GameModule.save reader: detached payloads, runtime validation and preservation of unsupported newer saves. Shell commits the final checkpoint before awarding XP; failed writes remain retryable.
