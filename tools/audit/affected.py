#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "artifacts" / "reports" / "affected"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _run_capture(args: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.returncode, (proc.stdout or ""), (proc.stderr or "")


def _run_capture_ok(args: list[str]) -> str:
    code, out, err = _run_capture(args)
    if code != 0:
        raise RuntimeError(err.strip() or out.strip() or f"command failed: {' '.join(args)}")
    return out


def _parse_json_from_turbo_output(output: str) -> dict[str, Any]:
    # turbo prints a version banner before the JSON.
    start = output.find("{")
    if start == -1:
        raise ValueError("Unable to find JSON object in turbo output")
    return json.loads(output[start:])


@dataclass(frozen=True)
class PackageInfo:
    name: str
    path: str  # repo-relative posix path


@dataclass(frozen=True)
class PackageGraphNode:
    name: str
    path: str  # repo-relative posix path
    dependencies: tuple[str, ...]
    dependents: tuple[str, ...]


@dataclass(frozen=True)
class AffectedResult:
    base_ref: str
    merge_base: str
    head_sha: str
    changed_files: tuple[str, ...]
    global_change: bool
    packages: tuple[str, ...]
    packages_with_dependents: tuple[str, ...]
    file_to_packages: dict[str, list[str]]
    generated_at: str


def get_head_sha() -> str:
    return _run_capture_ok(["git", "rev-parse", "HEAD"]).strip()


def get_merge_base(base_ref: str) -> tuple[str, str | None]:
    code, out, err = _run_capture(["git", "merge-base", base_ref, "HEAD"])
    if code == 0 and out.strip():
        return out.strip(), None

    # Fallback for repos without remote refs available (local-only).
    code2, out2, err2 = _run_capture(["git", "rev-parse", "HEAD~1"])
    if code2 == 0 and out2.strip():
        return out2.strip(), f"merge-base failed for {base_ref}; fell back to HEAD~1"

    return get_head_sha(), f"merge-base failed for {base_ref}; fell back to HEAD"


def get_changed_files(merge_base: str) -> list[str]:
    out = _run_capture_ok(["git", "diff", "--name-only", merge_base, "HEAD"])
    files = []
    for line in out.splitlines():
        p = line.strip().replace("\\", "/")
        if p:
            files.append(p)
    return sorted(set(files))


def get_turbo_packages() -> list[PackageInfo]:
    out = _run_capture_ok(["pnpm", "exec", "turbo", "ls", "--output", "json"])
    data = _parse_json_from_turbo_output(out)
    items = (((data.get("packages") or {}).get("items")) or []) if isinstance(data, dict) else []
    packages: list[PackageInfo] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        path = str(item.get("path") or "").strip().replace("\\", "/")
        if name and path:
            packages.append(PackageInfo(name=name, path=path))
    return sorted(packages, key=lambda p: p.name)


def get_turbo_package_graph(package_names: list[str]) -> dict[str, PackageGraphNode]:
    if not package_names:
        return {}
    out = _run_capture_ok(["pnpm", "exec", "turbo", "ls", "--output", "json", *package_names])
    data = _parse_json_from_turbo_output(out)
    items = (data.get("packages") or []) if isinstance(data, dict) else []
    graph: dict[str, PackageGraphNode] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        path = str(item.get("path") or "").strip().replace("\\", "/")
        deps = tuple(sorted([str(x) for x in (item.get("dependencies") or []) if str(x).strip()]))
        dents = tuple(sorted([str(x) for x in (item.get("dependents") or []) if str(x).strip()]))
        if name and path:
            graph[name] = PackageGraphNode(name=name, path=path, dependencies=deps, dependents=dents)
    return graph


def _is_global_trigger(path: str) -> bool:
    # Conservative: treat shared configs as global-impact.
    p = path.replace("\\", "/").lstrip("./")
    if p.startswith(".github/"):
        return True
    if p in {
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "turbo.json",
        "tsconfig.json",
        "vitest.config.ts",
        "playwright.config.ts",
        ".eslintrc.js",
        "eslint.config.js",
        ".prettierrc",
        ".prettierignore",
    }:
        return True
    return False


def map_files_to_packages(changed_files: list[str], packages: list[PackageInfo]) -> tuple[dict[str, list[str]], set[str], bool]:
    file_to_packages: dict[str, list[str]] = {}
    affected_packages: set[str] = set()
    global_change = False

    # Prefer the deepest package path when multiple match.
    packages_sorted = sorted(packages, key=lambda p: len(p.path), reverse=True)

    for f in changed_files:
        if _is_global_trigger(f):
            global_change = True
        matches: list[str] = []
        for pkg in packages_sorted:
            prefix = pkg.path.rstrip("/") + "/"
            if f == pkg.path or f.startswith(prefix):
                matches.append(pkg.name)
        if matches:
            file_to_packages[f] = sorted(set(matches))
            for m in matches:
                affected_packages.add(m)
        else:
            file_to_packages[f] = []
    return file_to_packages, affected_packages, global_change


def transitive_dependents(start: set[str], graph: dict[str, PackageGraphNode]) -> set[str]:
    queue = list(sorted(start))
    seen = set(start)
    while queue:
        pkg = queue.pop(0)
        node = graph.get(pkg)
        if node is None:
            continue
        for dependent in node.dependents:
            if dependent not in seen:
                seen.add(dependent)
                queue.append(dependent)
    return seen


def compute_affected(
    base_ref: str,
    include_dependents: bool,
) -> tuple[AffectedResult, list[str]]:
    merge_base, note = get_merge_base(base_ref)
    head_sha = get_head_sha()
    changed_files = get_changed_files(merge_base)

    packages = get_turbo_packages()
    file_to_packages, affected_packages, global_change = map_files_to_packages(changed_files, packages)

    # If a global trigger changed, treat the whole monorepo as affected.
    if global_change:
        affected_packages = {p.name for p in packages}

    graph = get_turbo_package_graph([p.name for p in packages]) if include_dependents else {}
    with_dependents = (
        transitive_dependents(affected_packages, graph) if include_dependents else affected_packages
    )

    warnings = [note] if note else []
    return (
        AffectedResult(
            base_ref=base_ref,
            merge_base=merge_base,
            head_sha=head_sha,
            changed_files=tuple(changed_files),
            global_change=global_change,
            packages=tuple(sorted(affected_packages)),
            packages_with_dependents=tuple(sorted(with_dependents)),
            file_to_packages={k: v for k, v in sorted(file_to_packages.items(), key=lambda x: x[0])},
            generated_at=_utc_now(),
        ),
        [w for w in warnings if w],
    )


def write_outputs(result: AffectedResult, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    (output_dir / "affected-files.txt").write_text("\n".join(result.changed_files) + "\n", encoding="utf-8")

    payload = {
        "generated_at": result.generated_at,
        "base_ref": result.base_ref,
        "merge_base": result.merge_base,
        "head_sha": result.head_sha,
        "global_change": result.global_change,
        "changed_files": list(result.changed_files),
        "affected_packages": list(result.packages),
        "affected_packages_with_dependents": list(result.packages_with_dependents),
        "file_to_packages": result.file_to_packages,
    }
    (output_dir / "affected-packages.json").write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    md = []
    md.append("# Affected Summary")
    md.append("")
    md.append(f"- Generated: `{result.generated_at}`")
    md.append(f"- Base ref: `{result.base_ref}`")
    md.append(f"- Merge base: `{result.merge_base}`")
    md.append(f"- Head: `{result.head_sha}`")
    md.append(f"- Global change: `{result.global_change}`")
    md.append(f"- Changed files: `{len(result.changed_files)}`")
    md.append(f"- Affected packages: `{len(result.packages)}`")
    md.append(f"- Affected + dependents: `{len(result.packages_with_dependents)}`")
    md.append("")
    if result.packages:
        md.append("## Packages")
        md.append("")
        for p in result.packages:
            md.append(f"- `{p}`")
        md.append("")
    (output_dir / "affected-summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Compute affected scope for PR optimization.")
    parser.add_argument("--base-ref", default="origin/main", help="Base ref for merge-base (default: origin/main).")
    parser.add_argument(
        "--include-dependents",
        action="store_true",
        help="Include transitive dependents of affected packages.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Output directory for affected reports (default: artifacts/reports/affected).",
    )
    args = parser.parse_args(argv)

    result, warnings = compute_affected(args.base_ref, include_dependents=args.include_dependents)
    write_outputs(result, Path(args.output_dir).resolve())

    for w in warnings:
        print(f"WARNING: {w}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

