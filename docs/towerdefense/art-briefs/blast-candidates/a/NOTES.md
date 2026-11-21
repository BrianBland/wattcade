# A · Furnace & Earthmover

**Fireball.** A full molten globe rolls under a fixed overhead light. Wide gold channels feed a single turbulent orange tail. On impact, a white flash spreads into five broad lobes. The dense middle burns away first, leaving curled red rims and drifting sparks.

**Mortar.** A squat cast-iron shell carries one worn lemon stripe and a sparking fuse. The flash throws umber soil and casing fragments through a single pale pressure wave. The craters have a warm, chipped lip and loose stones around the depression.

Draw the tail first and center the ball at (112, 32) on its canvas. Loop the ball and tail independently at 16 fps. The eight shell frames also loop. Play each impact once, centered on contact, at 16 fps for fireball or 20 fps for mortar. Pick one of three crater decals per mortar hit. Gravel and shrapnel are individual centered sprites.

Run `python3 paint.py` from the parent folder to rebuild both sheets and all straight-alpha PNGs. The generator uses NumPy, SciPy and Pillow (10.1 or later).
