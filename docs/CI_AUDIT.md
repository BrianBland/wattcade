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
