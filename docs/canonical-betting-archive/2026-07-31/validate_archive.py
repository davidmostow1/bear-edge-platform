#!/usr/bin/env python3
"""Validate the canonical betting archive as a self-consistent evidence package."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
ARCHIVE_DIR = Path(__file__).resolve().parent
MANIFEST_PATH = ARCHIVE_DIR / "manifest.json"
BLOB_LEDGER_PATH = ARCHIVE_DIR / "GIT_BLOB_SHAS.txt"
SELF_REFERENTIAL = {
    MANIFEST_PATH.relative_to(REPO_ROOT).as_posix(),
    BLOB_LEDGER_PATH.relative_to(REPO_ROOT).as_posix(),
}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def git_blob_sha1(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("utf-8")
    return hashlib.sha1(header + data).hexdigest()


def load_manifest(errors: list[str]) -> dict:
    try:
        value = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        fail(errors, f"manifest.json is not valid JSON: {exc}")
        return {}
    if not isinstance(value, dict):
        fail(errors, "manifest.json must contain a JSON object")
        return {}
    return value


def parse_blob_ledger(errors: list[str]) -> dict[str, str]:
    entries: dict[str, str] = {}
    for line_number, raw_line in enumerate(
        BLOB_LEDGER_PATH.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(maxsplit=1)
        if len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{40}", parts[0]):
            fail(errors, f"invalid GIT_BLOB_SHAS.txt line {line_number}: {raw_line}")
            continue
        digest, path = parts
        if path in entries:
            fail(errors, f"duplicate blob-ledger path: {path}")
        entries[path] = digest
    return entries


def repository_archive_files() -> set[str]:
    return {
        path.relative_to(REPO_ROOT).as_posix()
        for path in ARCHIVE_DIR.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts
    }


def changed_files(base_sha: str, errors: list[str]) -> set[str]:
    try:
        output = subprocess.check_output(
            ["git", "diff", "--name-only", f"{base_sha}..HEAD"],
            cwd=REPO_ROOT,
            text=True,
            stderr=subprocess.STDOUT,
        )
    except subprocess.CalledProcessError as exc:
        fail(errors, f"git diff failed: {exc.output.strip()}")
        return set()
    return {line.strip() for line in output.splitlines() if line.strip()}


def validate_markdown_links(paths: set[str], errors: list[str]) -> None:
    link_pattern = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    for repo_path in sorted(paths):
        if not repo_path.endswith(".md"):
            continue
        source = REPO_ROOT / repo_path
        text = source.read_text(encoding="utf-8")
        for target in link_pattern.findall(text):
            target = target.strip()
            if not target or target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target_without_anchor = target.split("#", 1)[0]
            resolved = (source.parent / target_without_anchor).resolve()
            try:
                resolved.relative_to(REPO_ROOT)
            except ValueError:
                fail(errors, f"Markdown link escapes repository: {repo_path} -> {target}")
                continue
            if not resolved.exists():
                fail(errors, f"broken local Markdown link: {repo_path} -> {target}")


def validate_json_files(paths: set[str], errors: list[str]) -> None:
    for repo_path in sorted(paths):
        if not repo_path.endswith(".json"):
            continue
        try:
            json.loads((REPO_ROOT / repo_path).read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"invalid JSON in {repo_path}: {exc}")


def main() -> int:
    errors: list[str] = []
    manifest = load_manifest(errors)
    ledger = parse_blob_ledger(errors)

    content_entries = manifest.get("content_files", [])
    if not isinstance(content_entries, list):
        fail(errors, "manifest content_files must be a list")
        content_entries = []

    manifest_hashes: dict[str, str] = {}
    for entry in content_entries:
        if not isinstance(entry, dict):
            fail(errors, f"manifest content entry is not an object: {entry!r}")
            continue
        path = entry.get("path")
        digest = entry.get("git_blob_sha1")
        if not isinstance(path, str) or not isinstance(digest, str):
            fail(errors, f"invalid manifest content entry: {entry!r}")
            continue
        if path in manifest_hashes:
            fail(errors, f"duplicate manifest path: {path}")
        manifest_hashes[path] = digest

    actual_archive = repository_archive_files()
    expected_archive_content = actual_archive - SELF_REFERENTIAL
    declared_content = set(manifest_hashes)

    missing_from_manifest = expected_archive_content - declared_content
    extra_in_manifest = declared_content - expected_archive_content
    if missing_from_manifest:
        fail(errors, f"archive files missing from manifest: {sorted(missing_from_manifest)}")
    if extra_in_manifest:
        fail(errors, f"manifest paths absent from archive: {sorted(extra_in_manifest)}")

    if set(ledger) != declared_content:
        fail(
            errors,
            "blob ledger and manifest path sets differ: "
            f"ledger_only={sorted(set(ledger) - declared_content)}, "
            f"manifest_only={sorted(declared_content - set(ledger))}",
        )

    for repo_path in sorted(declared_content):
        absolute = REPO_ROOT / repo_path
        if not absolute.is_file():
            continue
        actual_digest = git_blob_sha1(absolute.read_bytes())
        if manifest_hashes.get(repo_path) != actual_digest:
            fail(
                errors,
                f"manifest blob mismatch for {repo_path}: "
                f"declared={manifest_hashes.get(repo_path)} actual={actual_digest}",
            )
        if ledger.get(repo_path) != actual_digest:
            fail(
                errors,
                f"blob-ledger mismatch for {repo_path}: "
                f"declared={ledger.get(repo_path)} actual={actual_digest}",
            )

    base_sha = manifest.get("base_sha")
    allowed_non_archive = set(manifest.get("allowed_non_archive_paths", []))
    if isinstance(base_sha, str) and re.fullmatch(r"[0-9a-f]{40}", base_sha):
        changed = changed_files(base_sha, errors)
        allowed_changed = actual_archive | allowed_non_archive
        unexpected = changed - allowed_changed
        missing_changed = allowed_changed - changed
        if unexpected:
            fail(errors, f"unexpected changed paths: {sorted(unexpected)}")
        if missing_changed:
            fail(errors, f"declared archive/validation paths not present in diff: {sorted(missing_changed)}")
    else:
        fail(errors, "manifest base_sha must be a 40-character lowercase hexadecimal SHA")

    validate_json_files(actual_archive, errors)
    validate_markdown_links(actual_archive, errors)

    registry_path = ARCHIVE_DIR / "PREDICTION_MACHINE_REGISTRY.md"
    registry_text = registry_path.read_text(encoding="utf-8")
    for machine_file in sorted((ARCHIVE_DIR / "machines").glob("*.md")):
        relative = machine_file.relative_to(ARCHIVE_DIR).as_posix()
        if relative not in registry_text:
            fail(errors, f"machine evidence file is not referenced by registry: {relative}")

    if errors:
        print("CANONICAL ARCHIVE INTEGRITY: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print("CANONICAL ARCHIVE INTEGRITY: PASS")
    print(f"Archive files checked: {len(actual_archive)}")
    print(f"Content files hashed: {len(declared_content)}")
    print(f"Allowed non-archive paths: {len(allowed_non_archive)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
