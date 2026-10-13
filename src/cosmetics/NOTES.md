# Cosmetics

Both visual styles support the same permanent catalog IDs, loadouts, unlocks and bike attachment geometry.
`riderLook(profile)` carries the per-player preference into `RiderLook.artMode`; `withItem` retains it for Locker and reward previews. The stored `legacy`/`rich` preference values remain compatible with existing profiles and backups. UI names and art directories are Classic and Remastered.

## Drawing layout

- `draw/rider.ts`: style dispatcher. Shared entry points/catalog exports stay in `draw/`.
- `draw/classic/`: original rider, hats, jerseys, bikes, pets and trails. Uses the shared flat drawing helpers.
- `draw/remastered/`: outlined rider, material-lit hats/bikes, woven and stitched jerseys, articulated pets and layered trails. Its material helpers preserve glass transparency and keep tiny details legible.
- `draw/prims.ts`: common geometry, inverse kinematics, colors and types. Ships remain Cadenza art and are unaffected by the overworld setting.

The Remastered rig rasterizes at six pixels per logical unit on a reused 384 × 384 surface. Cloth and skin use seven-tone pixel clusters rather than broad polygon highlights. Solid artwork has a hard alpha edge; glass keeps its transparency. Material patches use a bounded cache. Its world footprint and pedal/hand joints are unchanged. Pets, trails and the projector trailer stay outside that surface so effects cannot be clipped.

## Adding or changing cosmetics

Add the permanent ID to `catalog.ts` and provide a drawing in both style directories. Tests enforce equal bike/hat/pet/trail catalogs and identical bike attachment geometry. Cosmetic-only changes must not alter gameplay, progression or equipped IDs. Jerseys retain every pattern in both styles; pets keep trotting, flying, idle and cargo poses; trails stop at zero speed.

## Review and verification

Run Vite, then use `/dev/cosmetics.html` for all six overworld collections, style/color selection, cadence, speed and freeze controls. `/dev/rider.html` checks complete rider poses, biome gear, tall bikes and trailers. These studios do not save profiles or grant unlocks.

`npx vitest run src/cosmetics src/shell/components/RiderAvatar.test.tsx` checks catalogs and previews. With Vite running, `node scripts/check-rider-render.mjs [base-url]` checks both styles in Chromium, all cosmetic render combinations and pedal phases. It writes optional review captures to ignored `artifacts/cosmetics/`; ffmpeg is used for the pedal GIF. Generated comparisons, studies and timing reports are not repository inputs.
