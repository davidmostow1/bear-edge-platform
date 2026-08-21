#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ARCHIVE = Path(__file__).resolve().parent
MANIFEST = ARCHIVE / "manifest.json"
LEDGER = ARCHIVE / "GIT_BLOB_SHAS.txt"
SELF = {
    MANIFEST.relative_to(ROOT).as_posix(),
    LEDGER.relative_to(ROOT).as_posix(),
}


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def main() -> int:
    errors: list[str] = []

    try:
        manifest = json.loads(MANIFEST.read_text())
    except Exception as exc:
        print(f"FAIL: invalid manifest: {exc}")
        return 1

    declared = {
        item["path"]: item["git_blob_sha1"]
        for item in manifest.get("content_files", [])
    }

    ledger: dict[str, str] = {}
    for number, raw in enumerate(LEDGER.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{40}", parts[0]):
            errors.append(f"invalid ledger line {number}: {raw}")
            continue
        ledger[parts[1]] = parts[0]

    archive_files = {
        path.relative_to(ROOT).as_posix()
        for path in ARCHIVE.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }
    content_files = archive_files - SELF

    if set(declared) != content_files:
        errors.append(
            f"manifest mismatch: missing={sorted(content_files - set(declared))} "
            f"extra={sorted(set(declared) - content_files)}"
        )
    if set(ledger) != set(declared):
        errors.append(
            f"ledger mismatch: ledger_only={sorted(set(ledger) - set(declared))} "
            f"manifest_only={sorted(set(declared) - set(ledger))}"
        )

    for repo_path, expected in sorted(declared.items()):
        path = ROOT / repo_path
        if not path.is_file():
            errors.append(f"missing content file: {repo_path}")
            continue
        actual = blob_sha(path.read_bytes())
        if actual != expected:
            errors.append(f"manifest blob mismatch: {repo_path}")
        if ledger.get(repo_path) != actual:
            errors.append(f"ledger blob mismatch: {repo_path}")

    base = manifest.get("base_sha", "")
    allowed_external = set(manifest.get("allowed_non_archive_paths", []))
    if not re.fullmatch(r"[0-9a-f]{40}", base):
        errors.append("base_sha is invalid")
    else:
        try:
            output = subprocess.check_output(
                ["git", "diff", "--name-only", f"{base}..HEAD"],
                cwd=ROOT,
                text=True,
                stderr=subprocess.STDOUT,
            )
            changed = {line for line in output.splitlines() if line}
            allowed = archive_files | allowed_external
            if changed != allowed:
                errors.append(
                    f"changed-path mismatch: unexpected={sorted(changed - allowed)} "
                    f"missing={sorted(allowed - changed)}"
                )
        except subprocess.CalledProcessError as exc:
            errors.append(f"git diff failed: {exc.output.strip()}")

    for repo_path in sorted(archive_files):
        path = ROOT / repo_path
        if path.suffix == ".json":
            try:
                json.loads(path.read_text())
            except Exception as exc:
                errors.append(f"invalid JSON {repo_path}: {exc}")

    link_re = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    for repo_path in sorted(archive_files):
        path = ROOT / repo_path
        if path.suffix != ".md":
            continue
        for target in link_re.findall(path.read_text()):
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            local = target.split("#", 1)[0]
            if local and not (path.parent / local).resolve().exists():
                errors.append(f"broken link: {repo_path} -> {target}")

    registry = (ARCHIVE / "PREDICTION_MACHINE_REGISTRY.md").read_text()
    for machine in sorted((ARCHIVE / "machines").glob("*.md")):
        relative = machine.relative_to(ARCHIVE).as_posix()
        if relative not in registry:
            errors.append(f"registry omits: {relative}")

    if errors:
        print("CANONICAL ARCHIVE INTEGRITY: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("CANONICAL ARCHIVE INTEGRITY: PASS")
    print(f"archive_files={len(archive_files)}")
    print(f"content_files={len(declared)}")
    print(f"external_paths={len(allowed_external)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
