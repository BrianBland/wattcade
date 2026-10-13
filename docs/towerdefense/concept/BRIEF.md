# Concept art brief: Dynamo Defense (wattcade)

You're producing **concept art only** (no code) for a 2D tower defense game that runs on an iPad in a web browser. The player rides an indoor exercise bike, and their pedalling powers the defenses. Another artist gets the same brief, and the results will be compared side by side, so stick to the deliverables, sizes and views below.

## The game in one paragraph
A gritty, mechanical frontier outpost sits at the bottom centre of the screen. Three trenches wind down from the top and sides, through dark alien rock, and meet at the outpost. Bug-like alien monsters (a hive of xenoforms, not ordinary insects) crawl down the trenches in waves. The outpost is a **dynamo**: a huge brass flywheel generator driven by a rider on a bike (seen through a small riveted cab window). A heavy turret sits on the flywheel's hub. Thick black power cables run from the dynamo out to defense towers beside the trenches, and visible pulses of cyan energy travel along the cables with each pedal stroke. Each wave is one brood colour and the turret uses one matching weapon for the whole wave: **Gatling** vs blue, **Flamethrower** vs red, **Railgun** vs purple. Bosses are gold.

## Style
- **Camera: strictly top-down (orthographic, looking straight down)**, like the game. No isometric, no 3/4 view, no perspective horizon. Aliens are seen from directly above, facing up the screen (toward the top), with soft drop shadows offset down-right.
- **Creatures: bug-like aliens, not bugs.** Aim for the menace of the arachnid war-bugs in *Starship Troopers* and the biomechanical horror of H.R. Giger's *Alien*: glossy black-tinted exoskeletons, ribbed, tube-like anatomy, elongated swept-back skulls, scythe limbs with spurs, inner-jaw glints, bladed whip tails, wet specular sheen, acid and bioluminescence glowing through seams. They should look dangerous and alien, and colour-coded. Capture the feel, but make the designs original: no copies of the films' creatures.
- **Mood:** gritty diesel-punk industrial vs organic alien hive. Steel deck plates, rivets, rust streaks, yellow/black hazard stripes, copper coils, brass, soot, smoke. Not clean sci-fi chrome, not cartoon-cute. Dark scene lit by its weapons: muzzle flashes, flames and tesla arcs throw pools of light.
- **Colour coding must read at a glance**, even when small. Each alien's exoskeleton tint and its glowing seams, veins and eyes carry its colour:
  - blue `#45d2ff`
  - red `#ff6a2a`
  - purple `#b97cff`
  - gold `#ffcf3a`

  Keep the environment desaturated (browns, greys, blacks) so the alien colours pop. Alien creep (purple-black organic growth with glowing pustules) spreads near the spawn edges.
- **Readability:** on an iPad the smallest alien (skitter) is about 28 px long and a warrior about 90 px. Silhouettes and colour have to work at that size. Use a dark outline around every creature.
- Original designs: inspired by those films' feel, but not likenesses of their creatures (or of StarCraft's Zerg).

## The aliens (8)
| Alien | Colour | Role | Look |
|---|---|---|---|
| Skitter | blue | swarm, comes in streams | small palm-like body on 8 splayed finger-legs, whip tail, cluster of glowing eyes |
| Glider | blue | flier, ignores trenches | ribbed dart body, bat-membrane wings on finger bones, barbed tail |
| Warrior | red | brute | arachnid war-form on 4 long high-kneed scythe legs, pincer mandibles, long ribbed skull, armoured back with glowing seams |
| Ram | red | charger, sprints | low and heavy, 6 thick legs, huge armoured battering crest over the head |
| Bulwark | purple | armoured, slow | low domed siege shell of fused plates, acid glands glowing through the seams, stubby legs |
| Broodmother | purple | carrier, drops spawn | fan-crested head, raised scythe forearms, vast translucent egg sac with glowing eggs |
| Stalker | shifting colour | cycles blue→red→purple | lean biomechanical hunter, long swept-back skull, dorsal tubes, clawed arms, long bladed tail |
| Hive Tyrant | gold | boss, fights in phases | massive war-beast with a spiked fan crest, two great scythe arms, six legs, long armoured tail |

## Towers and outpost
- **Tesla coil** (blue): copper coil rings around a glowing sphere, chain lightning.
- **Mortar** (red): squat armoured drum with a stubby barrel, smoke, recoil.
- **Prism lens** (purple): crystal on a tripod, focused beam.
- **Dynamo outpost:** riveted steel deck, hazard-stripe ring, big brass flywheel with spokes, a belt to a coil generator housing, a rider cab window, the turret on the hub (show the flamethrower variant).
- Towers stand on octagonal riveted pads, with a cable to the dynamo.

## Deliverables (PNG)
1. `td-battlefield-landscape.png`, 1600×1000: the whole battlefield mid-fight during a **RED BROOD** wave. The flamethrower is roasting warriors in the centre trench. A tesla coil arcs to blue skitters in the left trench, and a prism lens beams a red warrior on the right. Gliders fly over the rock, a bulwark and a broodmother emerge from the creep at the top, and acid splats and burnt husks litter the trenches. Leave the top ~110 px and the bottom ~120 px free of important detail (the game puts its HUD there).
2. `td-battlefield-portrait.png`, 900×1300: the same moment, composed for a portrait iPad.
3. `td-alien-roster.png`, 1600×1000: all 8 aliens on a plain dark background in a 4×2 grid, each labelled with its name. Same top-down view and light direction (light from the top-left).
4. `td-towers-base.png`, 1600×1000: the dynamo outpost large in the centre, with the three towers at level 1 and level 5 (show how upgrades bolt on extra parts).
5. *(Optional)* `td-warrior-walk.png`: an 8-frame top-down walk-cycle strip of the warrior on a transparent background, frames evenly spaced in one row.

## Rules for your report
- Generate the actual image files and list each file path you produced. If you couldn't produce a deliverable, say so plainly. Don't describe images that don't exist.
- Name the tool or model that generated each image.
- In 3–5 lines, say what you'd change to turn these into in-game sprite sheets (frame counts, sizes, how you'd keep the aliens consistent across frames).

## Where to put your files
Work on your own branch off `towerdefense-concept-art` and commit the PNGs to `docs/towerdefense/concept/<grok|codex>/`, using the file names above. Commit only the images and a short `NOTES.md` with your report. Don't change game code.

The `claude/` folder holds the code-drawn take on the same brief (generated by `dev/td-concept.html?view=scene|roster|portrait`). It's there for reference so the sets can be compared, not as a style to copy.
