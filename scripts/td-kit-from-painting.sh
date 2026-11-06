#!/usr/bin/env bash
# Baseline ground kit cut from the current painting (the bar for generated kits to beat), in the brief's layout.
# Usage: scripts/td-kit-from-painting.sh  →  public/td/ground-kits/painting-baseline/  (git-ignored)
# Props, the bridge deck and decals are placeholders: the painting has no clean cut-outs of them.
set -euo pipefail
cd "$(dirname "$0")/.."
P=public/td/environment/road/portrait.webp K=public/td/ground-kits/painting-baseline
mkdir -p "$K"
# painting px = (world + (40, 60)) * 16
magick "$P" -crop 576x544+1472+2720 +repage "$K/ground_a.png"                         # flagstone, world (52..88, 110..144)
magick "$P" -crop 544x384+1984+2176 +repage "$K/ground_b.png"                         # flagstone, world (84..118, 76..100)
magick "$P" -crop 320x176+1248+1216 +repage "$K/gravel.png"                           # gravel pocket, world (38..58, 16..27)
magick "$P" -crop 640x460+928+1290 +repage -rotate -8.4 -gravity center -crop 480x256+0-48 +repage "$K/road.png" # middle run, levelled
magick -size 1376x416 -seed 4 plasma:fractal -blur 0x14 -colorspace gray -auto-level -threshold 50% /tmp/td-kit-mask.png
magick "$P" -crop 1376x416+32+32 +repage /tmp/td-kit-mask.png -alpha off -compose CopyOpacity -composite -background '#00FF00' -alpha remove "$K/overlay_hive.png"
circle() { magick "$P" -crop "$1x$1+$2+$3" +repage \( -size "$1x$1" xc:black -fill white -draw "circle $(($1/2)),$(($1/2)) $(($1/2)),4" \) -alpha off -compose CopyOpacity -composite "$4"; }
circle 480 1040 2416 /tmp/td-kit-apron.png                                             # turret apron, world (40, 101)
circle 200 1052 1196 /tmp/td-kit-clearing.png                                          # pad clearing, world (32, 21)
magick -size 1536x1024 xc:'#00FF00' /tmp/td-kit-apron.png -geometry +40+40 -composite /tmp/td-kit-clearing.png -geometry +620+60 -composite \
  -fill '#2a2420' -draw 'ellipse 950,200 70,40 0,360' -draw 'ellipse 1200,220 50,60 0,360' -fill '#3a3028' -draw 'ellipse 900,520 90,30 0,360' -draw 'ellipse 1250,560 40,40 0,360' "$K/decals.png"
magick -size 1536x1024 xc:'#00FF00' -fill '#4a4a4a' -draw 'circle 120,120 120,60' -draw 'circle 420,140 420,70' -fill '#555' -draw 'circle 300,600 300,470' "$K/props.png"
circle 420 1614 110 /tmp/td-kit-hive.png                                               # hive burrow, world (74, -40)
magick /tmp/td-kit-hive.png -background '#00FF00' -alpha remove "$K/hive_mouth.png"
echo '{ "ppu": 16, "roadHalf": 5.5, "roadRim": 1.25 }' > "$K/kit.json"
echo "wrote $K"
