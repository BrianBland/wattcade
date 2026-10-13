# Generation provenance

Tool: OpenAI `image_gen.imagegen`. Initial and revision sheets are 1536x1024 RGB PNGs.
Reference: `reference-towers.png`, copied unchanged from commit
`0f5539cd5dae0a49b02402ebe09e349369bf7c52` on `codex/towerdefense-concept-art`, path
`docs/towerdefense/concept/codex/td-towers-base.png`, blob
`d78b0964cbbeaaecbc9f20bea45d04d1818de780`.

The following records the generation instructions; it is not a claim of perfect
compliance by the image model. Source crops in build.py accommodate imperfect grids.

All prompts requested a wide production cutout sheet with four equal columns and
two rows, flat pure #00FF00 background, no text, borders, drop shadows or ground.
Parts were requested centered within cells, strictly top-down orthographic with
light vertically above, no perspective or visible side faces. Reference was style
only: worn desaturated riveted gunmetal, brass, copper, rust, soot, hazard stripes.
Upgrades were requested as isolated paired components around an empty green center,
with no repeated pads, center bodies, beams, lightning or connecting cables.

Tesla referenced the approved concept image. Row 1: shared octagonal cable-socket
pad, static plinth, copper coil/sphere head aiming up, L2 auxiliary coil pair.
Row 2: L3 blue capacitor pair, L4 hazard armour pair, L5 blue antenna pair, empty.
Output: `exec-7c0ae413-2a09-4724-9c6b-1e7d35f490e9.png` retained as
`raw/tesla-sheet-raw.png`.

Mortar referenced both the approved concept and the generated Tesla sheet.
Row 1: static chassis with red vents, separate drum/cradle with recoil guides,
separate straight overhead barrel with muzzle up and rounded breech foot,
L2 copper heat-exchanger pair. Row 2: L3 red radiator pair, L4 hazard armour pair,
L5 red ammunition-feed pair, empty. The prompt emphasized an overhead rectangular
barrel silhouette rather than a foreshortened circular mouth facing the viewer.
Output: `exec-506c9d96-3b9a-4645-97e4-335e5abb400a.png` retained as
`raw/mortar-sheet-raw.png`.

Prism referenced both the approved concept and the generated Tesla sheet.
Row 1: static chassis, violet diamond crystal head in a copper focusing collar,
L2 small side-crystal pair, L3 violet focusing-lens pair. Row 2: L4 hazard armour
pair, L5 tall violet crystal pair, empty, empty. Crystals point up.
Output: `exec-a4c7da7d-ae48-43fb-99fc-446c2541744b.png` retained as
`raw/prism-sheet-raw.png`.

## Revision 2 — closer to the original concept

User rejected the first pass as 3/10 and requested a much closer match to the
original concept. All revision prompts referred to the actual original image,
prioritizing its steep overhead viewpoint and visible vertical machinery, the
large main weapon silhouettes, grey riveted steel, copper, aged brass, rust and
soot. This intentionally follows the concept's visible depth rather than the
initial brief's strict orthographic view. Parts remain separately rigged on green.

Tesla revision: large upright solenoid/sphere rather than flat spiral disc;
static octagonal pedestal, auxiliary copper coils, angled ribbed blue capacitors,
grey armour segments, thin bronze electrode rods. The first revision's main head
was too long and included auxiliary machinery, so that head was superseded.
Output `exec-82772aea-a0fa-4f3d-84e9-173d6c9ff99e.png` is retained as
`raw/tesla-sheet-v2-raw.png`; its base and upgrade components are used.

Mortar revision: heavy near-upright iron cylinder with a visible open dark bore,
brass reinforcement bands, soot and restrained red vents. Octagonal chassis and
drum, hydraulic side struts, red radiator pods, grey armour and copper heat
exchangers were generated as separate parts, avoiding the first pass's long
thin overhead gun shape. Output `exec-81859b93-ec90-4aa9-82ae-fb9c52a15a72.png`
is retained as `raw/mortar-sheet-v2-raw.png`.

Prism revision: prominent tall violet crystal in a small dark pronged mount;
grey octagonal base with forward copper capacitor, two smaller side crystals,
purple focusing capacitors, grey armour, copper solenoids. L5 adds power coils
rather than another pair of tall crystals. Output
`exec-8b666375-4828-4859-9191-6269aea83ee1.png` is retained as
`raw/prism-sheet-v2-raw.png`.

Tesla head refinement referenced both the original and rejected long-coil
revision. Requested one isolated head only, with stout short copper winding body
90–100% sphere width and about one sphere diameter in height, black frame bars,
two winding bands and a vivid electrical blue sphere, without platform or extra
coils. Output `exec-ce5a8373-43fe-4c9d-a81f-f2e7bf43a728.png` is a 1254x1254 RGB
PNG retained as `raw/tesla-head-v2-raw.png`. Build uses its central 580x935 crop.

## Centered mounts and passive/attack VFX

The user requested platform centering and aiming only for Mortar. Main weapons
are now placed using anatomical socket coordinates in the retained source crops,
not centered image rectangles. Transparent frame headroom avoids shrinking them.
Tesla and Prism remain fixed; no new body art was generated for this change.

Tesla effects used the original reference and requested a four-column/two-row
1536x1024 green sheet containing only fine white-core electric-blue arcs. Row1
has four sparse passive patterns around an empty sphere center; row2 has four
charging/discharge/decay patterns branching toward imaginary side electrodes.
No machinery, solid glow disks, background, labels or ground shadows. Output
exec-491e95dd-67a2-4a43-9a8c-29461315f887.png is retained as raw/tesla-effects-raw.png.

Prism effects used the same reference and grid, requesting violet/magenta wisps,
sharp lilac sparks and narrow tip flares around an invisible tall central crystal.
Row1 has four restrained passive patterns; row2 has charge, forked discharge and
decay patterns linking imaginary side crystals. No solid crystals, machinery,
opaque bloom discs, labels, backgrounds or ground. Output
exec-81a22a3e-8edc-469d-b148-0102c53ee61e.png is retained as raw/prism-effects-raw.png.

The effect strips preserve source cell origins for stable registration. Body
glow is time-keyed from the exported emissive masks; generated effects use
premultiplied additive compositing. No procedural replacement arc art is drawn.

## Concentric subplatform correction

No new art was generated or retouched. The user identified that static base
plates were still offset even after their sockets were aligned. Main pad and
subplatform placement now registers the center of authored octagonal outline
bounds, excluding asymmetrical nozzles, forward fittings and sockets. Weapon
feet retain their centered attachment points; animation behavior is unchanged.
The exact source outline bounds are recorded in build.py; transformed bounds
and outlineCenter are exported in the corresponding manifest parts. alignment.png
shows the actual pad/base cutouts without heads, with a second row of outline
bounds and centerlines for direct inspection.

## Final-detail art revision

User requested more Tesla L5 coils/arcing orbs, more Mortar L5 heat/glow, one
fewer Prism L1 coil and Prism L5 power-coil placement closer to the concept.
The accepted outline centering and fixed Tesla/Prism behavior remain intact.

Tesla: requested two separate auxiliary copper solenoids with blue glass arc
orbs, black steel caps, brass mounting feet, steep overhead view, no platforms
or connecting cables, on 1536x1024 green. The output
exec-fa37dd4e-58bd-4308-90fe-1389f662c584.png is retained as
raw/tesla-l5-orb-coils-raw.png; its two assemblies augment the original L5
electrode pair. Long exterior arcs are cropped to fit the actual rig envelope;
the retained generated VFX supplies changing discharge paths.

Mortar: requested a 4x2 green detail sheet, top row four red glass indicator
domes on riveted diamond plates, lower row two red-orange hot cooling vent
housings, remaining cells empty. Output
exec-82d1dd1b-1ce1-44e4-8f37-48e0da902a7f.png is retained as
raw/mortar-l5-hot-details-raw.png. Details join the existing L5 heat exchangers
and share its matched emissive canvas; L5 emission is scaled by 1.8.

Prism: local edit of the original v2 parts sheet, removing only the orange
front winding coil in the first base cell and restoring a compact steel/brass
coupling with underlying riveted plate. Requested preservation of all outlines,
framing, side struts and other cells. Output
exec-3b1ba102-6cfe-42f1-86ce-331b9dab8d7d.png is retained as
raw/prism-base-v3-raw.png. Only its first base cell is used; all other parts
still use their approved source. Existing L5 copper-coil cutouts move to one
large center-front coil and one smaller rear-right coil behind the crystal.
No replacement coil art was procedurally drawn.
