#!/usr/bin/env python3
"""PostToolUse hook for Edit, Write and MultiEdit.

Reads the file that was just written and reports violations of the repository
rules. Exit code 2 sends the findings back to Claude, which must fix them.
"""
import json
import os
import re
import sys

SKIPPED_NAMES = {"LICENSE", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"}
SKIPPED_PARTS = ("/node_modules/", "/.git/", "/.claude/hooks/")
PROSE_SUFFIXES = {".md", ".mdx", ".yml", ".yaml", ".json", ".txt", ".html", ".toml", ".example"}
CODE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
MAX_BYTES = 1_000_000
MAX_FINDINGS = 10

DASHES = re.compile("[—–]")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐✅❌]")
SECRETS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}"),
    re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
]
ANY_TYPE = re.compile(r":\s*any\b|\bas\s+any\b|<any>|\bany\[\]")
TS_DISABLE = re.compile(r"@ts-ignore|@ts-nocheck")
ESLINT_DISABLE = re.compile(r"eslint-disable(?:-next-line|-line)?\b")
SKIPPED_OR_FOCUSED_TEST = re.compile(r"\b(?:it|test|describe)\.(?:skip|only)\(|\bx(?:it|describe)\(")
USES = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)")
PINNED = re.compile(r"@[0-9a-f]{40}$")


def is_comment(line):
    stripped = line.strip()
    return stripped.startswith(("//", "*", "/*"))


def findings_for(path, text):
    name = os.path.basename(path)
    suffix = os.path.splitext(name)[1].lower()
    is_prose = suffix in PROSE_SUFFIXES or name == ".env.example"
    is_code = suffix in CODE_SUFFIXES
    is_workflow = "/.github/workflows/" in path and suffix in {".yml", ".yaml"}
    found = []

    for number, line in enumerate(text.splitlines(), start=1):
        if is_prose and DASHES.search(line):
            found.append((number, "em dash or en dash: use a comma, parentheses or a colon"))
        if EMOJI.search(line):
            found.append((number, "emoji: not allowed in code, commits or documentation"))
        for pattern in SECRETS:
            if pattern.search(line):
                found.append((number, "looks like a secret or private key: never commit credentials"))
                break
        if is_code:
            if not is_comment(line) and ANY_TYPE.search(line):
                found.append((number, "type 'any': use 'unknown' and narrow it"))
            if TS_DISABLE.search(line):
                found.append((number, "TypeScript check disabled: fix the error or ask the owner"))
            if ESLINT_DISABLE.search(line) and " -- " not in line:
                found.append((number, "lint rule disabled without a justification (add ' -- reason')"))
            if SKIPPED_OR_FOCUSED_TEST.search(line):
                found.append((number, "skipped or focused test: fix it or report it, never skip to get green"))
        if is_workflow:
            uses = USES.match(line)
            if uses:
                target = uses.group(1)
                if not target.startswith(("./", "docker://")) and not PINNED.search(target):
                    found.append((number, f"action '{target}' is not pinned by full commit SHA"))
    return found


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    if data.get("tool_name") not in {"Edit", "Write", "MultiEdit"}:
        return 0
    path = (data.get("tool_input") or {}).get("file_path", "")
    if not path or not os.path.isfile(path):
        return 0
    if os.path.basename(path) in SKIPPED_NAMES or any(part in path for part in SKIPPED_PARTS):
        return 0
    if os.path.getsize(path) > MAX_BYTES:
        return 0
    try:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
    except (OSError, UnicodeDecodeError):
        return 0

    found = findings_for(path, text)
    if not found:
        return 0
    print(f"Rule violations in {path}:", file=sys.stderr)
    for number, message in found[:MAX_FINDINGS]:
        print(f"  line {number}: {message}", file=sys.stderr)
    if len(found) > MAX_FINDINGS:
        print(f"  ... and {len(found) - MAX_FINDINGS} more", file=sys.stderr)
    print("Fix these before continuing.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
