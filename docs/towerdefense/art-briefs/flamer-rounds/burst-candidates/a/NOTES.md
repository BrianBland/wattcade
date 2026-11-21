# Gold Jet · round 2

A white-yellow sheet leaves the full duckbill slot and breaks into tapered yellow tongues. The sides roll outward in lobes. Orange-red tips, a translucent fringe and a few flying embers mark the limit of the burst. Gaps between the tongues reveal targets beneath the fan.

The brush pattern travels 180 px along the fan in one 0.6-second cycle (300 px/s). Its texture tiles in the direction of travel. Each tongue narrows and hooks toward its tip. The renderer composites a soft orange halo behind the strokes and exports straight-alpha RGBA.

At 20 fps, play start 00–05, sustain 00–11, sustain 00–03, then end 00–05 for a 1.4-second burst. Align (0, 150) to the mouth. The sheet reads left to right, then down.

Run `python3 paint.py` from the parent folder to regenerate both studies with NumPy, SciPy and Pillow.
