#!/usr/bin/env bash
# Real-audio inputs for scripts/rolling-drift.ts (#64). Downloads three CC-licensed tracks already used as app samples
# (archive.org, see src/media/library/samples.ts) and cuts 150 s mono 22.05 kHz WAV clips into .cache/drift-clips/.
# Clips are NOT committed. Attribution:
#   "Funky Chunk" and "Shiny Tech" by Kevin MacLeod (incompetech.com), CC BY 4.0 https://creativecommons.org/licenses/by/4.0/
#   "Go" by Josh Woodward, CC BY 3.0 https://creativecommons.org/licenses/by/3.0/
# Usage: scripts/fetch-drift-clips.sh && npx tsx scripts/rolling-drift.ts --md .cache/drift-clips/*.wav
set -euo pipefail
out=.cache/drift-clips; mkdir -p "$out"
fetch() { # name url start
  [ -f "$out/$1.wav" ] && return
  curl -fsSL --retry 3 "$2" -o "$out/$1.mp3" || { echo "skip $1 (download failed)"; rm -f "$out/$1.mp3"; return 0; }
  ffmpeg -loglevel error -y -ss "$3" -t 150 -i "$out/$1.mp3" -ac 1 -ar 22050 -c:a pcm_s16le "$out/$1.wav"
  rm "$out/$1.mp3"
}
KM=https://archive.org/download/KevinMacLeod_2019-04_Discography
fetch km-funky-chunk "$KM/Kevin%20MacLeod/Groovy/Kevin%20MacLeod%20-%2001%20-%20Funky%20Chunk.mp3" 0
fetch km-shiny-tech "$KM/Kevin%20MacLeod/Hard%20Electronic/Kevin%20MacLeod%20-%2017%20-%20Shiny%20Tech.mp3" 0
fetch jw-go "https://archive.org/download/JoshWoodwardSelection/06-JoshWoodward-TheSimpleLife-02-Go.mp3" 0
ls -la "$out"
