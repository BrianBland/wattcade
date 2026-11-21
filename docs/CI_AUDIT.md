# CI audit

Measurements below are from checkout `3d4137d` on 17 November 2026, plus hosted
runs through `2a4033d` (20 November 2026). They describe those checkouts. A
later suite can be slower or faster without any workflow change.

## What the check job actually spends

Hosted `ubuntu-latest` has 4 CPUs. Across 15 successful main pushes from 14 to
20 November, the test step ran 232s to 441s (median 322s). `npm ci` was 5 to 10s,
typecheck 1 to 4s, the Tower Defense asset check under 1s, and the build 1 to 2s.
Tests are about 90% of the check job. Deploy's own install plus build is about
25s; card-clip recording, not the check job, is the long deploy step.

The useful change is cold-start order. Vitest already runs failed files first,
then longer files, once `node_modules/.vite/vitest/results.json` exists. A cold
run falls back to source-file size. The Watershed scenario files are a few
hundred bytes and take two to three minutes, so a cold size sort starts them
last. On the 6 November hosted run the full-ride file (187s) started at +212s
and finished the job. `scripts/ci/test-timings.json` is a hint list for that
case. It never adds or drops a file. Live cache wins over a hint, and a path
that no longer exists is ignored.

Worker count stays at Vitest's default, `max(cpus - 1, 1)`. On a 2-CPU quota
that default is 1 worker, so a local pair of "defaults" against `maxWorkers:
'100%'` measures 1 worker against 2. That was the 601s to 368s pair on
`3d4137d` (Node 24, one run each, CPU up 8.5%). It is not a hosted saving.
The hosted runner already defaults to 3 workers; forcing 4 was not shown to
beat that. One hosted run of the earlier branch finished its test step in 240s,
inside the 232 to 441s range above. No hosted percentage is claimed.

Public GitHub Actions does not bill standard minutes on a public repo. No
invoice was available, so no dollar saving is claimed either.

## What changed

- Build runs before the suite. A broken build fails in about a second instead
  of after the tests. The same commands still run, and none is allowed to fail
  open. Diagnostic upload is the only best-effort step.
- `scripts/ci/measure.py` writes elapsed time, child CPU, and largest-child RSS
  for each command, preserves the command's exit code, and records the commit.
  On pull requests the commit is `github.event.pull_request.head.sha`.
  `github.sha` on that event is a synthetic merge commit, so the receipt keeps
  both. Largest-child RSS is not job memory. Receipts are uploaded for seven
  days and also printed in the job log.
- Stale Seaside shop reviews cancel, the same way CI and Preview already cancel
  superseded runs. Shop runs are about 60 to 90s and have been re-pushed in
  bursts. The saving is not measured.

## What was left alone

Affected-test omission. `src/progression/scenarios.test.ts` loads scenarios
dynamically, and other tests read manifests, card assets, and generated CSS
from disk. Import reachability is not enough. The full suite still runs on
every PR and main push.

A `node_modules` cache. It might save the 5 to 10s install and would also
restore Vitest's results cache, which makes longest-first automatic. Cache
transfer can cost as much as `npm ci`. Measure a hosted restore before adding
one. pnpm and Bun do not change this: install is not the long step, pnpm 10
skips esbuild's postinstall unless builds are approved, and neither runtime
runs this suite faster than Vitest.

Deploy build artifacts, extra shards, and smaller runners. The hosted build is
about 1s. Do not drop the main-push check: Deploy waits on it for the merged SHA.

## Reproducing

Use Node 22, `npm ci`, and the same checkout. Time one command:

```sh
python3 scripts/ci/measure.py /tmp/ci-metrics/tests.json -- npm test
```

For a cold comparison, pass `--no-cache`. A second run already learns order
from Vitest's results cache. Compare file, test name, and status, not just the
total. One local pair is a sample, not a hosted percentage.

To refresh hints, take a passing hosted log's per-file durations and update
`scripts/ci/test-timings.json`, including `source_run` and `source_sha`. Keep
only files at or above `threshold_ms`. To roll back ordering, remove the
`sequence` block and the sequencer class from `vitest.config.ts`. The checks
and the measurement wrapper still work without it.
