# A · Split Draft

Four tufts rise from small yellow-white roots into orange forks. Variant 0 leans right with a short outer lick, 1 burns low with two shoulders, 2 carries a tall left-hand tongue, and 3 spreads before it leans downwind. Their moving gaps expose the road and passing aliens.

Anchor each 64×128 sprite at (32, 120). Loop tuft frames 00–15 at 18 fps with a different start offset per placement. Play the centered 192×192 flare once at 20 fps beneath the impact. Its broken elliptical lip shows the fire catching along the ground.

On burnout, play the matching eight dying frames once. Frame 00 matches that variant’s loop pose 00. An 18 fps playback gives about 0.44 seconds for the tuft to collapse into embers and a rising wisp.

The sheet shows eight staggered tufts over the game’s volcanic road. The sprites use straight alpha for normal compositing. Run `python3 -B render.py` from `groundfire/` to rebuild both candidates with NumPy, SciPy and Pillow 10.1+.
