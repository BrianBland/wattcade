# CI support

- `measure.py OUTPUT.json -- COMMAND [ARG ...]` runs one command on Linux, writes
  elapsed/child CPU/largest-child RSS and Actions identity, and preserves failure.
- CI uploads only these JSON receipts, including after a failed check. Upload is
  best effort; the command checks remain blocking and receipts also appear in logs.
- `test-timings.json` records long-file ordering hints and their hosted provenance.
  The sequencer in `vitest.config.ts` never removes tests; live timing/failure
  history takes precedence. Unknown files still run with isolation.
- Run `npm run typecheck`, `python3 scripts/td-check-assets.py`, `npm run build`
  and the full `npm test`. Validate workflows with actionlint.
- Measurement success, exit 7, missing command and SIGTERM were checked directly;
  ordering was checked for identity preservation, unknown files, cached failures,
  live timings, empty input and multiple projects.
- Baselines, qualification limits and rollback: `../../docs/CI_AUDIT.md`.
