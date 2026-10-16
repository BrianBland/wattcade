# Dynamo outpost assets — issue 130

Generated with OpenAI `image_gen.imagegen`, guided by the approved original
`td-towers-base.png` and the accepted issue 129 tower material/registration work.
Python/Pillow/NumPy keyed the retained #00FF00 sheets, registered machinery axles,
extracted emission and rendered every preview from this manifest. No game code
changes. Working originals/scripts/full previews are on `codex/td-outpost-work`
under `docs/towerdefense/concept/codex/outpost/`.

`FILES.txt` lists every actual file in this production set:
- `manifest.json`: 14 parts, parent/pivot/offset/z, weapon selection, six sockets,
  three weapon muzzles, rider-window rectangle, aim/roll/charge/damage controls.
- `parts/*.png`: all transparent parts, six Gatling barrel phases and their
  matching `_glow.png` canvases. Four pixels of transparent padding per canvas.
- `masks/cab_window.png`: fixed destination-out stencil for the real empty window.
- `preview.png`: all 18 requested states on #211d19, manifest-rendered. Includes
  flywheel 0°/30°, each head at 0°/±60°, rail 0–3 charges, both damage stages and
  the empty window with rider-sized placeholder; all at an exact 220px deck size.

Coordinates are absolute assembled rest-frame pixels; inherit parent transforms.
Positive aim angles are clockwise, zero points up. The 520px frame provides
rotation padding around the 440px deck footprint (2×220px game size). Render
exactly one weapon group. Every head pivots about [260,260], as does the concentric flywheel;
heads parent to the fixed deck, not the spinning wheel. The Gatling child inherits
aim and rolls through its six axial sprite phases, not an in-plane aim rotation.
Use `axialSpin.frames` with the shared part offset; each has a matching frame glow.
These are illustrated roll phases, not exact mesh projection; collar highlights
vary slightly. Repeating five-barrel orientation is 72°; six phases at 50ms each.

Rail cap parts are glow-only with intentionally clear base files. Display cap N
when charge >= N; blend their glows additively. All other base art remains complete
when glows are disabled. Damage stages are cumulative. For the cab, apply the
window stencil at z44, draw the runtime rider in its 76×47px safe rectangle and
then draw the cab at z45. The manifest suggests placement for the existing side-on
`drawRider`; clip rider cosmetics to the window. The stencil must stay fixed as
the wheel spins. Do not attach its aperture to the flywheel's rotation.

Light is overhead; the approved concept's small bevel depth and nozzle mouths
are retained. No ground/shadow/background pixels are baked into parts. Production
preview is resized and palette-compressed for the <1.5MB total folder budget;
individual art retains full RGBA detail. Full-size proofs and rebuild/check scripts
are retained with the originals. Runtime integration is outside this art issue.
