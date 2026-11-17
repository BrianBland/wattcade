# CI audit and qualification

Audited checkout: `3d4137d0592abc027681df7939e52454eeac4740` (clean branch `work`).
Measurements collected 17 November 2026. The checkout predates current remote
history; this audit changes the supplied checkout rather than silently updating it.

## Sources and applicability

Read [Vincent Koc's article](https://vincent.build/openclaw-ci-cost-reduction/),
the linked [OpenClaw workflow at a7d05c7](https://github.com/openclaw/openclaw/blob/a7d05c7af04aa17ac57c994da238d0c60f058ca6/.github/workflows/ci.yml),
and its [changed-test planner](https://github.com/openclaw/openclaw/blob/a7d05c7af04aa17ac57c994da238d0c60f058ca6/scripts/lib/ci-changed-node-test-plan.mts#L436).
The useful principles here are reducing repeated work, balancing the remaining
work, retaining required checks, and comparing elapsed time with compute.
OpenClaw's reported 95.5% reduction is sponsored compute value across changing
workloads, not a transferable fixed-workload speedup or a paid invoice.

Wattcade has one packed Linux check job, npm caching, and 219 test files at this
revision. OpenClaw's pnpm, Bun, native platform lanes, custom dependency records,
runner fleet and selection policy do not apply directly. No runner migration,
isolation removal, test deletion, or learned selection is justified by this audit.

## Existing checks and baseline

| Workflow / job | Trigger and work | Finding |
| --- | --- | --- |
| CI / check | Every PR and main push: npm ci, typecheck, Tower Defense asset validation, full Vitest, build | Already packed; cancels superseded runs; test execution dominates |
| Deploy / deploy | Successful main-push CI, or manual dispatch | Reinstalls and rebuilds; retains an independent production gate and exact triggering SHA |
| Preview / preview, cleanup | Same-repository PR preview; cleanup on close | Rebuilds independently for early previews; cancellation already configured |
| Seaside shop review / shop | Seaside source, dev page, review script or workflow changes | Installs Chromium and dependencies; no superseded-run cancellation |

CI job ID/name `check`, workflow name `CI`, triggers, full scenario coverage,
asset/type/build validation and production gating must remain intact.
Visible active rulesets require PRs and prevent deletion/non-fast-forward pushes.
Classic branch-protection reads returned HTTP 403 (integration lacks administration
access); the absence of additional required checks cannot be established.

The [successful hosted run for the exact checkout](https://github.com/BrianBland/wattcade/actions/runs/42256637327)
is the primary hosted baseline, attempt 1, job 128025460070:

| Metric | Observed |
| --- | ---: |
| Creation to check completion | 426 s |
| Check runner elapsed | 422 s |
| npm ci | 8 s |
| Typecheck | 3 s |
| Asset validation | <1 s (API timestamp resolution) |
| Tests, Actions step | 401 s |
| Tests, Vitest clock | 399.75 s |
| Build | 1 s |
| Test result | 218 files passed, 1 skipped; 1,628 tests passed, 3 skipped |
| Rounded runner minutes | 8 |

The three Watershed scenario files are tiny wrappers, so cold Vitest scheduling
by source-file size starts them late. Full ride took 187.194 s, spin/idle
117.340 s and grind 100.924 s in this run. Full ride finished last. Their contracts
are independent and remain necessary; the opportunity is scheduling, not deletion.

A separate convenience sample is the first ten CI runs in a newest-first
30-workflow-run API response: nine successful runs and one cancelled run, all
attempt 1, on newer revisions. Successful check median: 444 s; test-step median:
423 s. Including cancellation: 3,990 runner-seconds, 71 rounded runner-minutes.
This sample is context, not a comparison with the checkout's tests or a population
estimate. See `docs/ci/hosted-baseline.json` for retained IDs and step timestamps.

Runner-seconds are elapsed allocated machine time, not CPU time. Rounded minutes
are `sum(ceil(job_seconds / 60))`, a billing proxy. This is a public repository;
standard hosted Actions may have no incremental charge. No account invoice,
credits, quota or negotiated pricing was available, so no dollar saving is claimed.

## Reviewable steps and priorities

1. Record reproducible measurements before optimization. `scripts/ci/measure.py`
   wraps an argv command, records elapsed/child CPU/largest-child RSS and exit code,
   and returns the command's failure status. Receipts include Actions revision,
   run ID and attempt when available. Largest-child RSS is not aggregate job memory.
2. Qualify longest-first cold scheduling for the full inventory. Seed only the
   known long files from the exact-revision hosted run; use live Vitest timing and
   failure history where available. Timing data must never select or omit a file.
   Benchmark worker counts before changing capacity. Preserve default isolation.
3. Put the cheap build check before tests to expose build failures sooner. Add
   cancellation for obsolete Seaside reviews without changing paths or checks.
   Retain timing receipts in CI for post-push verification on hosted runners.

Deferred: affected-test omission. `src/progression/scenarios.test.ts` dynamically
loads game scenarios. Tests also enumerate scenario source files, read public
manifests and card assets, and validate generated CSS from disk. Plain import
reachability is insufficient. This rollout executes the full suite on every PR
and main push, including changes to unknown/shared/configuration/deleted/renamed
inputs. Selection needs explicit ownership, regression replay and full-run audits
before it can earn a place here.

Deferred: deployment build artifacts (only a 1 s hosted build, versus transfer and
trust-validation overhead), additional npm/node_modules/browser caches (setup is
small and cache transfer needs measurement), extra shards and smaller runners.
Do not remove main-push validation: Deploy depends on proof for the merged SHA.

## Reproducing and evaluating changes

Use Node 22, `npm ci`, the same checkout and the same worker count. Time one command:

```sh
python3 scripts/ci/measure.py /tmp/ci-metrics/tests.json -- npm test
```

For controlled comparisons, disable the Vitest results cache with `--no-cache`;
otherwise a second run already learns longest-first ordering. Run variants
sequentially on the same machine. Compare the test names/statuses as well as totals,
whole-command elapsed time, CPU seconds, and runner-minute rounding. Retain existing
intentional skips. Check typecheck, asset validation and build too. A local test
improvement does not establish hosted queue time, monetary savings or PR-to-merge
improvement; confirm comparable hosted runs after pushing these commits.

Cold ordering hints are the files taking at least 25 seconds in the recorded
hosted run. To refresh them, collect a passing full run's per-file durations and
update both provenance fields in `scripts/ci/test-timings.json`. Live Vitest
failure/timing history takes precedence. Stale or missing hints affect ordering
only: unknown tests remain in the inventory. To roll back scheduling, remove the
`maxWorkers`, `sequence` and the sequencer class/imports from `vitest.config.ts`; the full
checks and measurement receipts remain usable independently.

## Local paired result

On the same Linux workspace (2 CPU quota, Node v24.19.0, Vitest 5.0.3,
8 GiB memory limit), one full run per variant produced:

| Full test command | Original defaults | Longest-first + 100% workers |
| --- | ---: | ---: |
| Workers | 1 | 2 |
| Elapsed seconds | 601.322 | 368.198 |
| Child CPU seconds | 671.416 | 728.664 |
| Allocated runner-seconds at fixed machine size | 601.322 | 368.198 |
| Files | 219 | 219 |
| Passing / intentionally skipped tests | 1,628 / 3 | 1,628 / 3 |

Elapsed/allocated runner time fell **38.8%**, while CPU seconds rose **8.5%**.
This is a worthwhile feedback/allocated-machine-time tradeoff, not a reduction
in executed CPU work. At a fixed per-minute machine rate the shorter allocation
would cost less; a service charging CPU-seconds could charge more. Actual dollar
savings for this public repository remain unestablished.

Both runs used the same JSON reporter. The original results cache was absent;
the candidate used `--no-cache` after a clean lockfile install. Production and
test sources were unchanged. Full sorted `(file, test name, status)` inventories
and file lists were identical, including all intentional skips. The test/status
inventory SHA-256 is `743cd15acb317d5a345c6a80f97d92c7b3b927652e013c9d1bf6445492012134`.
The two scheduling changes were measured together; no separate speedup is assigned
to either. One pair is a qualification sample, not a statistical performance claim.
Node 24 is the supplied local runtime, so this pair does not establish the size of
a Node 22 hosted improvement. Node 22 compatibility is qualified separately below.

## Final qualification

The final configuration also passed the complete suite on **Node v22.23.5**:
219 files, 1,628 passing tests, the same three intentional skips, and the same
file/test/status inventory. Full test command: 393.369 s elapsed, 779.270 s child
CPU. This is a separate compatibility run, not a paired Node 22 speedup result.
Typecheck (4.410 s), asset validation (0.068 s), and build (1.544 s) passed on
Node 22 before that test run, exercising the new command order.

Additional checks passed:

- actionlint v1.7.12 on all four workflows; `git diff --check`.
- Workflow names, trigger definitions and job IDs match the originals. Deploy and
  Preview remain byte-for-byte unchanged. All five original commands remain;
  no command check is conditional or allowed to ignore failure. Only diagnostic
  artifact storage is best effort. Measurement JSON also remains in job logs.
- Measurement wrapper: successful command, exit 7, missing executable (127),
  and SIGTERM (143) all preserve the expected exit and write receipts.
- Sequencer: retains each specification exactly once, including unknown files;
  leaves the input array unchanged and preserves empty inventories and project boundaries;
  cached failures run first and live durations override cold hints.

Machine-readable local receipts and inventory digests are in
`docs/ci/local-results.json`. The full suite ran for both variants and again on
Node 22. No affected tests were omitted and no test/source behavior was changed.
Superseded Seaside-review cancellation is validated structurally; its savings
have not been measured. No production or preview deployment was performed.

After these commits are pushed, compare equivalent first-attempt hosted runs on
the same runner class and runtime, retaining failures and cancellations in total
compute. Use workflow creation to last required check for feedback (including
queue/setup/artifact overhead), and sum job elapsed time for allocated compute.
Compare CPU receipts separately and apply actual account rates/rounding only
when known. The new seven-day artifacts make that follow-up measurable; this
local result does not promise a hosted percentage, a dollar saving or a delivery
cycle improvement.
