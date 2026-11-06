# Ground-kit competition: rules for the competing agents

Several agents each build ground material kits for Dynamo Defense from the same brief, iterating against the same
automated checks and visual harness. A human judges blind between rounds. The judge names each agent (`grok`,
`grok-b`, `grok-c`, `codex`…); that name is `<agent>` in every folder below. An agent may also be given an art-direction
**lean**: a stance within the brief to explore. Keep to it; it is what makes your entry different.
**The spec is [BRIEF.md](BRIEF.md). Read it fully before generating anything.**

## Setup

```sh
git fetch origin td-ground-spike && git checkout td-ground-spike
npm install
npm run dev -- --port 5203            # keep running; the review script renders through it
export CHROMIUM_PATH=/path/to/chromium   # any Chromium or chrome-headless-shell
```

- Sprite reference sheet: open `http://127.0.0.1:5203/dev/td-ground.html?sheet=1` and save the canvas.
- Style reference: `docs/towerdefense/paint-guide/rounds/portrait-3/painting.png`, `public/td/outpost/preview.png`,
  `public/td/towers/preview.png`.
- Baseline to beat for Outpost Rock: `scripts/td-kit-from-painting.sh` → `painting-baseline`.

## The loop (one iteration)

1. **Generate** the images this iteration needs (first iteration: all of them; later: only what you are fixing).
   Keep every prompt you used.
2. **Save** the complete kit to `public/td/ground-kits/<style>-<agent>-v<N>/` (copy unchanged files forward from v<N-1>).
   File names, sizes and colour keys exactly as in the brief. Add `kit.json` only if the scale is off.
3. **Review**: `node scripts/td-kit-review.mjs <style>-<agent>-v<N>[,painting-baseline]`
   → `/tmp/td-kit-review/<kits>.png` (your kit on three generated maps, portrait and landscape, with the real turret,
   towers and aliens) and `.json` (automated checks; `fails` lists missed gates).
4. **Look at the PNG**, not just the JSON. Score yourself 1–5 on each rubric line in the brief with one sentence of
   evidence each. Be harsh: the human judge will compare you blind against the other agent.
5. **Log** the iteration in `public/td/ground-kits/<style>-<agent>-v<N>/ITERATIONS.md`: prompts, what changed and why,
   check results, self-scores, the weakest point you will attack next.
6. **Decide**: iterate again on the weakest point, or stop (see limits).

## Rounds and limits

| Round | Deliver | Max iterations |
|---|---|---|
| 0 · calibration | Outpost Rock `ground_a.png` + `road.png` only | 3 |
| 1 · first kits | Full **Outpost Rock** and **Scrapyard** kits | 4 per style |
| 2 · revision | Both kits again, using the judge's feedback | 2 per style |
| 3 · new styles | Styles assigned by the judge (Blight, Volcanic, Badlands, Overgrown Ruins) | 4 per style |

Stop early when every gate passes and two iterations in a row don't raise your self-score.
At the end of each round, `cp -r` your best iteration to `public/td/ground-kits/<style>-<agent>/` (the judged copy)
and post a report (format below).

## Rules

- **Generate, don't copy.** The painting and sprites are style references only. Never crop, trace, or paste them (or
  any other existing art) into kit images.
- **Don't change the game or the harness.** Write only inside your own `public/td/ground-kits/<style>-<agent>*`
  folders. If the harness has a bug, report it instead of fixing it.
- **Don't open other agents' folders.** Judging is blind; stay independent.
- **Never commit images.** `public/td/ground-kits/` is git-ignored on purpose. No pushes.
- Track your image count; efficiency is noted in the final comparison.

## Report format (end of each round)

```
Agent: <agent> (lean: <lean or none>)   Round: <n>   Style: <style>   Judged copy: public/td/ground-kits/<style>-<agent>/
Iterations: <n> (best: v<N>)   Images generated: <n>
Gates: PASS | FAIL (<remaining fails>)
Self-scores (1–5): reads <n> · style <n> · composites <n> · lighting <n> · scale <n> · variety <n>
What changed per iteration: <one line each>
Known weaknesses: <bullets>
```

## Judging (human)

```sh
node scripts/td-kit-review.mjs outpost-grok,outpost-grok-b,outpost-grok-c,painting-baseline --blind
node scripts/td-kit-review.mjs scrapyard-grok,scrapyard-grok-b,scrapyard-grok-c --blind
```

Then the same on iPad (`/dev/td-ground.html?kit=…&blind=1`). Feedback to each agent uses the rubric lines from the
brief, without revealing the other agents' work.
