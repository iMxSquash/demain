#!/usr/bin/env python3
"""Stop hook.

Runs lint, typecheck and tests when the working tree holds code changes, and
refuses to let Claude finish while one of them fails. Exit code 2 sends the
output back to Claude, which must fix it. After MAX_ATTEMPTS failures in a
row the session is allowed to end with a warning, so that a failure Claude
cannot fix never loops forever.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

CHECKS = [
    ("lint", ["npm", "run", "lint", "--silent"]),
    ("typecheck", ["npm", "run", "typecheck", "--silent"]),
    ("test", ["npm", "run", "test", "--silent"]),
]
CHECKED_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".sql"}
IGNORED_PREFIXES = (".claude/",)
MAX_ATTEMPTS = 3
CHECK_TIMEOUT_SECONDS = 600
OUTPUT_TAIL_LINES = 40


def changed_files(cwd):
    try:
        out = subprocess.run(
            ["git", "status", "--porcelain", "-uall"],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return []
    return [line[3:].split(" -> ")[-1].strip('"') for line in out.stdout.splitlines()]


def has_code_changes(cwd):
    return any(
        os.path.splitext(path)[1].lower() in CHECKED_SUFFIXES and not path.startswith(IGNORED_PREFIXES)
        for path in changed_files(cwd)
    )


def run_check(command, cwd):
    """Return None when the check passes, otherwise the tail of its output."""
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=CHECK_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return f"timed out after {CHECK_TIMEOUT_SECONDS} seconds"
    if result.returncode == 0:
        return None
    lines = (result.stdout + result.stderr).splitlines()
    return "\n".join(lines[-OUTPUT_TAIL_LINES:])


def read_attempts(counter):
    try:
        with open(counter, encoding="utf-8") as handle:
            return int(handle.read())
    except (OSError, ValueError):
        return 0


def warn(message):
    print(json.dumps({"systemMessage": message}))


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    cwd = data.get("cwd") or os.getcwd()
    counter = os.path.join(tempfile.gettempdir(), f"demain-stop-attempts-{data.get('session_id', 'unknown')}")

    if not has_code_changes(cwd):
        return 0
    if shutil.which("npm") is None:
        warn("stop-checks: npm is not on the PATH of the hook, lint, typecheck and tests were NOT run.")
        return 0

    for name, command in CHECKS:
        failure = run_check(command, cwd)
        if failure is None:
            continue
        attempts = read_attempts(counter) + 1
        if attempts >= MAX_ATTEMPTS:
            os.remove(counter)
            warn(f"stop-checks: '{name}' still fails after {MAX_ATTEMPTS} attempts, the session ends with a failing check.")
            return 0
        with open(counter, "w", encoding="utf-8") as handle:
            handle.write(str(attempts))
        print(f"'{name}' fails (attempt {attempts}/{MAX_ATTEMPTS}). Fix it before finishing:\n{failure}", file=sys.stderr)
        return 2

    if os.path.exists(counter):
        os.remove(counter)
    return 0


if __name__ == "__main__":
    sys.exit(main())
