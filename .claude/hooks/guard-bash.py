#!/usr/bin/env python3
"""PreToolUse hook for the Bash tool.

Turns rules that must never depend on memory into mechanical guards.
Exit code 2 blocks the command and sends stderr back to Claude.
"""
import json
import re
import shlex
import subprocess
import sys

PROTECTED_BRANCHES = {"main", "master"}
SEGMENT_SPLIT = re.compile(r"&&|\|\||;|\n|\|")
PUSH = re.compile(r"^git(?:\s+-C\s+\S+)?\s+push\b(.*)$")
COMMIT = re.compile(r"^git(?:\s+-C\s+\S+)?\s+commit\b(.*)$")
MESSAGE_COMMAND = re.compile(
    r"^(?:git(?:\s+-C\s+\S+)?\s+commit"
    r"|gh\s+pr\s+(?:create|edit|comment)"
    r"|gh\s+issue\s+(?:create|edit|comment)"
    r"|gh\s+release\s+(?:create|edit))\b"
)
FORBIDDEN_TEXT = [
    (re.compile(r"co-authored-by", re.IGNORECASE), "a Co-Authored-By line"),
    (re.compile(r"generated with", re.IGNORECASE), "a 'Generated with' mention"),
    (re.compile(r"claude code", re.IGNORECASE), "a mention of Claude Code"),
    (re.compile("[—–]"), "an em dash or en dash"),
]


def tokens_of(rest):
    try:
        return shlex.split(rest)
    except ValueError:
        return rest.split()


def current_branch(cwd):
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=cwd or None,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def check_push(rest, cwd):
    tokens = tokens_of(rest)
    if any(t in ("--force", "-f") or t.startswith("--force=") for t in tokens):
        return "git push --force is forbidden. Use --force-with-lease on a working branch if really needed."
    if any(t in ("--all", "--mirror") for t in tokens):
        return "git push --all and --mirror would push protected branches."
    if "--no-verify" in tokens:
        return "git push --no-verify is forbidden: never bypass checks."
    positional = [t for t in tokens if not t.startswith("-")]
    refspecs = positional[1:]
    for refspec in refspecs:
        destination = refspec.split(":")[-1].lstrip("+")
        destination = destination.removeprefix("refs/heads/")
        if destination in PROTECTED_BRANCHES:
            return "Direct push to a protected branch is forbidden. Use a branch and a pull request."
    if not refspecs and current_branch(cwd) in PROTECTED_BRANCHES:
        return "The current branch is protected: a bare git push would push it. Use a branch and a pull request."
    return None


def check_commit(rest):
    tokens = tokens_of(rest)
    if "--no-verify" in tokens or "-n" in tokens:
        return "git commit --no-verify (or -n) is forbidden: never bypass checks."
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    if data.get("tool_name") != "Bash":
        return 0
    command = (data.get("tool_input") or {}).get("command", "")
    cwd = data.get("cwd")
    segments = [s.strip() for s in SEGMENT_SPLIT.split(command)]

    for segment in segments:
        push = PUSH.match(segment)
        if push:
            problem = check_push(push.group(1), cwd)
            if problem:
                print(problem, file=sys.stderr)
                return 2
        commit = COMMIT.match(segment)
        if commit:
            problem = check_commit(commit.group(1))
            if problem:
                print(problem, file=sys.stderr)
                return 2

    if any(MESSAGE_COMMAND.match(s) for s in segments):
        for pattern, label in FORBIDDEN_TEXT:
            if pattern.search(command):
                print(
                    f"Blocked: the message of this commit, pull request, issue or release contains {label}. "
                    "Commit and PR texts must not mention AI tooling or use dashes of that kind: rewrite the text.",
                    file=sys.stderr,
                )
                return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
