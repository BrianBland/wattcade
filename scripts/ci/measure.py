#!/usr/bin/env python3
"""Measure one CI command, write a receipt even on failure, and preserve its exit code."""
import json
import os
from pathlib import Path
import resource
import subprocess
import sys
import time


def main():
    if len(sys.argv) < 4 or sys.argv[2] != "--":
        sys.exit("usage: measure.py OUTPUT.json -- COMMAND [ARG ...]")
    output = Path(sys.argv[1])
    command = sys.argv[3:]
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    start = time.perf_counter()
    try:
        code = subprocess.run(command, check=False).returncode
    except OSError as error:
        print(error, file=sys.stderr)
        code = 127
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    result = {
        "command": command,
        "exit_code": code,
        "wall_seconds": round(time.perf_counter() - start, 3),
        "cpu_seconds": round(after.ru_utime + after.ru_stime - before.ru_utime - before.ru_stime, 3),
        # Linux ru_maxrss is KiB, the largest child process, not aggregate memory.
        "max_child_rss_kib": after.ru_maxrss,
        "runner_os": sys.platform,
        "runner_arch": os.uname().machine,
        "revision": os.environ.get("GITHUB_SHA"),
        "run_id": os.environ.get("GITHUB_RUN_ID"),
        "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print("CI measurement: " + json.dumps(result), flush=True)
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a") as stream:
            stream.write(f"- `{output.stem}`: exit {code}, {result['wall_seconds']}s elapsed, "
                         f"{result['cpu_seconds']}s CPU, {result['max_child_rss_kib']} KiB largest child RSS.\n")
    return code if code >= 0 else 128 - code


if __name__ == "__main__":
    sys.exit(main())
