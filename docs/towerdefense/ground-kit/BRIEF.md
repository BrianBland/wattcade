# Dynamo Defense ground kits: brief for image generation

Dynamo Defense is moving from one hand-painted map to **procedurally generated maps**. The game draws the road,
pads and layout itself and composites the ground from a **material kit**: a small set of top-down texture swatches
and stamps per visual style. We need kits in several styles. **Several image-generating agents receive this same
brief and compete**; the kits are judged side by side in the game (see Judging).

Do not paint whole maps. Every image below is a material, a strip, or a sheet of stamps.

## How the kit is used (so the art works)

- **Swatches are sampled, not tiled whole.** The compositor copies many random windows from each swatch and blends them
  over irregular seams ("texture bombing"). A swatch therefore needs **even density and no focal features**: no single
  big rock, no vignette, no lighting gradient across the image. Seamless edges help but are not required.
- **The road strip is bent along curves.** A straight strip is copied along the road's centre line, so it must be
  **straight, horizontal, centred and uniform** along its length.
- **Stamps are cut out by colour key** and placed on top (props, decals, pad clearings, the turret apron, bridge parts,
  the hive mouth).
- The field is viewed **straight down** in portrait and **rotated 90°** in landscape.

## Rules for every image (paste with each prompt)

> Top-down orthographic view, camera pointing straight down, no perspective, no horizon, no tilt. Painterly hand-painted
> game-art texture, crisp detail, matching the reference art's brushwork, value range and saturation. **Soft overhead
> light**: very short, soft contact shadows directly under objects; no strong directional light, no long cast shadows,
> no light gradient or vignette across the image. Even detail density edge to edge. No text, no labels, no UI, no grid,
> no characters, no creatures, no buildings, no machinery larger than the prop sizes given. Muted, low-saturation
> palette: the game's enemies and towers are **bright blue, red and purple**, so the ground must not be dominated by
> saturated blue, red or purple.

**Scale** (game units; the kit is used at 16 px per unit, so 1024 px = 64 units):

- Road: 8 units wide (≈128 px) plus a 1-unit rim each side.
- Tower pad clearing: ~10 units across (≈160 px). Turret apron: ~26 units across (≈420 px).
- Enemies are 4–17 units long; small props 2–4 units, medium 5–8, large 9–14.
- Pebbles 0.2–0.6 units (3–10 px); paving stones or rock plates 4–9 units (60–140 px).

**Colour key for cut-outs**: draw stamps on a perfectly flat **#00FF00** background (or **#FF00FF** for styles that use
green), no gradient, no texture, no shadow on the key colour. Keep 32 px of key colour between stamps.

**References to attach** (if the tool accepts images):

1. The current painting, for style and value range: `docs/towerdefense/paint-guide/rounds/portrait-3/painting.png`.
2. Sprite reference sheet at kit scale: open `/dev/td-ground.html?sheet=1` and save the canvas (1536×1344: turret,
   three towers at levels 1/3/5, every ground alien, a 10-unit scale bar, on neutral grey). The boss on it is today's
   size; it may shrink about 25% with the narrower road. Never put generated stills in `main` (reference PRs only).
3. The turret and tower sheets: `public/td/outpost/preview.png`, `public/td/towers/preview.png`.

## Deliverables per style (9 images)

| File | Size | What |
|---|---|---|
| `ground_a.png` | 1024×1024 | Main ground swatch. Even, no road, no props. |
| `ground_b.png` | 1024×1024 | Variant ground: rougher or darker patches of the same material, used to break up large areas. |
| `gravel.png` | 1024×1024 | The fine transitional material that rings the road (finer and lighter than the ground). |
| `road.png` | 1536×1024 | One straight horizontal road across the full width, centred: surface ≈128 px tall plus worn rims, total band ≈224 px; ground above and below. Seamless left to right. |
| `overlay_hive.png` | 1024×1024 | The infestation that spreads from the enemy hive (creep, blight, rust bloom… per style), on key colour, with ragged organic edges. |
| `props.png` | 1536×1024 | 8 separate props on key colour: 3 small, 3 medium, 2 large. |
| `decals.png` | 1536×1024 | On key colour: one pad clearing (~160 px circle), one turret apron (~420 px circle), and 6 flat decals (stains, cracks, scorch, puddles). |
| `bridge.png` | 1536×1024 | On key colour: a straight horizontal bridge deck segment (≈160 px tall, seamless left to right), two end caps, and one railing piece. |
| `hive_mouth.png` | 1024×1024 | The enemy entrance (burrow, breach, vent…), ~20 units across, on key colour. |

Name each kit folder `<style>-<agent>` (for example `scrapyard-grok-b`), put it in `public/td/ground-kits/`
(git-ignored: candidates never get committed), and add a `NOTES.md` with the prompts used. Optional `kit.json`:
`{ "ppu": 16, "roadHalf": 4, "roadRim": 1 }`, i.e. image pixels per world unit, and the road strip's half-width and rim
in world units, if a delivery came out at a different scale. `ground_a.png` and `road.png` are required; anything
missing falls back or is skipped.

## Per-image prompts

Prefix each with the rules block above and the style block below.

- **ground_a**: "Seamless top-down ground material swatch of {GROUND}. Uniform density, no focal point, no path."
- **ground_b**: "Variant of the same {GROUND} with rougher, darker patches and a few cracks. Same scale and light."
- **gravel**: "Top-down swatch of {GRAVEL}: finer, slightly lighter loose material that collects beside a worn path."
- **road**: "A single straight horizontal {ROAD} crossing the image edge to edge, perfectly centred and level, worn
  rims and a few embedded pebbles along both edges, {GROUND} above and below. Uniform along its length, seamless left
  to right, no turns, no markings."
- **overlay_hive**: "Top-down patches of {HIVE} spreading in irregular tendrils, on flat #00FF00."
- **props**: "Eight separate top-down props on flat #00FF00, well spaced, no overlap: {PROPS}."
- **decals**: "On flat #00FF00: a round levelled build clearing of {CLEARING}; a large round apron of {APRON}; six flat
  ground decals: {DECALS}."
- **bridge**: "On flat #00FF00: a straight top-down bridge deck of {BRIDGE}, horizontal, seamless left to right; its two
  end caps; one railing segment."
- **hive_mouth**: "On flat #00FF00: a top-down {HIVE_MOUTH} where enemies emerge, roughly circular, dark centre."

## Styles

Each style keeps the road **lighter than its surroundings** and leaves blue, red and purple to the enemies.

### 1. Outpost Rock (remaster of today's map)
- GROUND: dark slate-grey flagstone plates and broken rock, charcoal grit between plates.
- GRAVEL: fine charcoal and grey pebbles.  ROAD: packed ochre dirt with sandy ruts.
- HIVE: dark violet-black creep with thin dull-violet veins (violet only here, near the hive).
- PROPS: rusted barrels, a broken crate, pipe sections, a toppled lamp post, boulders, a cable spool.
- CLEARING: levelled ochre dirt. APRON: packed dirt with brass bolt plates.  DECALS: oil stain, cracks, scorch, puddle.
- BRIDGE: weathered timber planks on iron stringers.  HIVE_MOUTH: a collapsed burrow in rock.

### 2. Blight
- GROUND: ash-grey cracked earth, dead roots, scattered bone and chitin fragments.
- GRAVEL: grey ash and bone grit.  ROAD: pale dusty trail, bleached.
- HIVE: sickly yellow-green rot spreading far, glistening ichor, black fungal crust (green-yellow, not purple).
- PROPS: ribcage, skull of a large beast, dead tree stump, fungal growths, a rusted cage, egg sacs (dull, not glowing).
- CLEARING: scraped pale earth. APRON: cleared ash with salt ring.  DECALS: ichor pools, rot stains, cracks, burn.
- BRIDGE: bone-and-plank bridge.  HIVE_MOUTH: a pulsing rotten crater.

### 3. Scrapyard
- GROUND: rusted steel plates, riveted grating, oil-black dirt between them.
- GRAVEL: metal shavings, bolts and cinder.  ROAD: compacted cinder track with tyre ruts.
- HIVE: corrosion bloom with dark oily seep (rust orange-brown, desaturated).
- PROPS: stacked crates, oil drums, pipe bundles, gears, a cable reel, a crane hook, a scrap heap, a dead generator.
- CLEARING: a steel floor plate. APRON: riveted brass and steel ring.  DECALS: oil, rust run-off, welding scorch, puddle.
- BRIDGE: steel girder with checker-plate deck.  HIVE_MOUTH: a torn open storm drain.

### 4. Volcanic
- GROUND: black basalt plates and cooled lava crust, drifts of grey ash.
- GRAVEL: crushed pumice and obsidian chips.  ROAD: pale ash-and-pumice path (clearly lighter than the basalt).
- HIVE: glassy black obsidian growth with **thin, dim** ember cracks.
- PROPS: basalt columns, steam vents, sulfur crystal clusters (yellow), obsidian shards, a charred tree.
- CLEARING: smoothed ash. APRON: fused glassy rock ring.  DECALS: sulfur stains, ash drifts, fissures, cooled pools.
- BRIDGE: basalt slab bridge.  HIVE_MOUTH: a collapsed lava tube.
- Caution: lava is the red enemies' colour. Keep molten glow to **thin, low-saturation cracks**, under 5% of any image.

### 5. Badlands
- GROUND: ochre and tan sandstone strata, wind-carved rock, cracked clay pans.
- GRAVEL: sand and sandstone chips.  ROAD: pale caliche (limestone) path.
- HIVE: dark tar seep with brown crust.
- PROPS: dead shrubs, a cattle skull, fossil slab, mining cart, wooden scaffold, rock arch fragment.
- CLEARING: hard-packed caliche. APRON: stone-and-timber platform ring.  DECALS: tar stain, salt crust, cracks, tracks.
- BRIDGE: rope-and-timber trestle.  HIVE_MOUTH: a sinkhole in sandstone.
- Caution: keep it ochre and tan, not rust red.

### 6. Overgrown Ruins
- GROUND: broken ancient paving overgrown with moss, roots and low ferns.
- GRAVEL: mossy rubble and leaf litter.  ROAD: worn pale stone path with grass in the joints.
- HIVE: dark thorny bramble with grey-black growths.
- PROPS: fallen pillar, statue head, stone urn, root tangle, mossy boulder, broken archway.
- CLEARING: a round mosaic floor. APRON: carved stone ring.  DECALS: moss patches, puddles, cracks, leaf piles.
- BRIDGE: stone arch bridge.  HIVE_MOUTH: a cracked crypt opening.
- Green is free: no enemy or tower is green. Keep the greens muted so towers' cyan and glow still pop.

### Optional: Tundra
Frost-split grey rock, wind-packed snow, a trampled slush road. Risky: ice blue competes with the blue brood, so only
attempt it with near-neutral whites and greys.

## Competition and judging

**Round 1:** both generators deliver **Outpost Rock** and **Scrapyard** (18 images each). The winner per style is
judged on the rubric below; **round 2** assigns the remaining styles to the stronger generator, or splits them.

Kits are dropped into the ground spike and judged on the same three generated maps (today's road, ring-in/bridge-out,
trident) in portrait and landscape, with the real turret, towers and aliens on top, then on iPad:

- `/dev/td-ground.html?kit=outpost-grok,outpost-grok-b&blind=1`: kits side by side, names hidden, order shuffled.
- `scripts/td-kit-from-painting.sh` builds `painting-baseline` from today's painting (placeholder props, deck and
  decals): the bar for **Outpost Rock** to beat. Add it to the comparison: `?kit=painting-baseline,outpost-grok,...`.

| Weight | Check | How |
|---|---|---|
| Gate | Usable at all | Correct sizes, top-down, flat key colour, nothing baked into swatches that shouldn't be |
| 25% | Reads with our art | Turret, towers and every alien colour pop; road clearly lighter than surroundings |
| 20% | Style match | Brushwork and value range sit with the painting and sprites (side by side, blind) |
| 20% | Composites cleanly | No visible repeats or seams after bombing; road strip uniform and seamless; stamps cut cleanly |
| 15% | Lighting | Soft overhead; nothing looks wrong when rotated for landscape |
| 10% | Scale | Pebbles, plates, props and clearings match the scale table |
| 10% | Variety | ground_a/ground_b, props and decals give enough variation to avoid sameness |

Judges see kits with the generator name hidden.
