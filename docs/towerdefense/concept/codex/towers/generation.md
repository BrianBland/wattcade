# Generation provenance

Tool: OpenAI `image_gen.imagegen`. All three outputs are 1536x1024 RGB PNGs.
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
