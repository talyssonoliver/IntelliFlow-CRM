#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _run_version(cmd: list[str]) -> dict[str, Any]:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    out = (proc.stdout or "").strip()
    err = (proc.stderr or "").strip()
    return {
        "command": " ".join(cmd),
        "exit_code": proc.returncode,
        "stdout": out,
        "stderr": err,
        "version": out.splitlines()[0] if out else None,
    }


def collect_versions() -> dict[str, Any]:
    versions: dict[str, Any] = {
        "generated_at": _utc_now(),
        "platform": platform.platform(),
        "tools": {},
    }

    # System
    versions["tools"]["python"] = _run_version(["python", "--version"])
    versions["tools"]["git"] = _run_version(["git", "--version"])

    # Node ecosystem
    versions["tools"]["node"] = _run_version(["node", "--version"])
    versions["tools"]["pnpm"] = _run_version(["pnpm", "--version"])
    versions["tools"]["turbo"] = _run_version(["pnpm", "exec", "turbo", "--version"])
    versions["tools"]["eslint"] = _run_version(["pnpm", "exec", "eslint", "--version"])
    versions["tools"]["prettier"] = _run_version(["pnpm", "exec", "prettier", "--version"])
    versions["tools"]["vitest"] = _run_version(["pnpm", "exec", "vitest", "--version"])

    # Optional security/static analysis tools (best-effort)
    versions["tools"]["semgrep"] = _run_version(["semgrep", "--version"])
    versions["tools"]["trivy"] = _run_version(["trivy", "--version"])
    versions["tools"]["snyk"] = _run_version(["snyk", "--version"])
    versions["tools"]["gitleaks"] = _run_version(["gitleaks", "version"])

    return versions


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Capture tool versions into a JSON file.")
    parser.add_argument("--out", required=True, help="Output path for tool-versions.json")
    args = parser.parse_args(argv)

    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(collect_versions(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

