#!/bin/bash
set -e
cd /tmp/rev
OUT=/home/brian/code/brianbland/wattcade/.claude/worktrees/bridge-cse_01W4nwQE9jzRm2yDJBjDhPbM/docs/towerdefense/concept/claude/hybrid/parts
magick warrior-src.png -colorspace gray -level 7%,11% lum.png
piece() { # name "polygon points" [close radius]
  magick -size 400x380 xc:black -fill white -draw "polygon $2" -blur 0x0.8 poly-$1.png
  magick lum.png poly-$1.png -compose multiply -composite -morphology Close Disk:${3:-2.5} alpha-$1.png
  magick warrior-src.png alpha-$1.png -alpha off -compose copy-opacity -composite $OUT/$1.png
}
# body: right half outline mirrored about x=190
R="205,26 231,66 233,97 229,120 225,140 231,173 229,207 226,233 222,267 219,300 212,333 200,367 190,380"
L=$(echo $R | tr ' ' '\n' | tac | awk -F, '{printf "%d,%d ", 380-$1, $2}')
piece body "190,36 $R $L" 4
piece femur-front "220,128 232,116 282,68 297,70 304,86 293,101 247,151 232,154 222,147" 2.5
piece claw-front  "277,66 283,58 300,60 309,74 328,108 344,148 348,182 342,182 336,170 331,140 318,114 301,93 288,84" 2.5
piece femur-mid   "229,186 262,180 299,163 313,170 314,196 272,224 240,225 228,212" 2.5
piece claw-mid    "296,170 302,163 314,170 325,186 341,220 348,267 346,302 336,346 330,346 326,326 332,283 330,234 320,209 309,194 296,184" 2.5
piece femur-rear  "220,238 240,229 256,258 278,253 294,260 292,284 256,304 238,302 226,281" 2.5
piece claw-rear   "274,262 280,251 293,262 301,298 300,334 286,380 280,380 279,352 286,317 286,293 279,280 272,270" 2.5
ls $OUT
