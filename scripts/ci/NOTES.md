# CI support

- `measure.py OUTPUT.json -- COMMAND [ARG ...]` runs one command on Linux, writes
  elapsed/child CPU/largest-child RSS and Actions identity, and preserves failure.
  `revision` prefers `CI_HEAD_SHA` (the PR head); `github_sha` keeps `GITHUB_SHA`,
  which on pull_request is the synthetic merge commit.
- CI uploads only these JSON receipts, including after a failed check. Upload is
  best effort; the command checks remain blocking and receipts also appear in logs.
- `test-timings.json` is a cold-start order hint for files at or above 20s in one
  hosted run. The sequencer never removes tests. Live timing and failure history
  win, and a path that no longer exists is ignored. Worker count is unchanged.
- Run `npm run typecheck`, `python3 scripts/td-check-assets.py`, `npm run build`
  and the full `npm test`. Validate workflows with actionlint.
- Measurement success, exit 7, missing command and SIGTERM were checked directly;
  ordering was checked for identity preservation, unknown files, cached failures,
  live timings, empty input and multiple projects.
- Baselines, qualification limits and rollback: `../../docs/CI_AUDIT.md`.
