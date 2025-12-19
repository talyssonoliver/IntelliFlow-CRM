#!/usr/bin/env python
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import platform
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

import affected
import tool_versions


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MATRIX_PATH = REPO_ROOT / "audit-matrix.yml"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "artifacts" / "reports" / "system-audit"


def _configure_stdio() -> None:
    # Avoid hard failures when logs contain Unicode characters that aren't supported by the
    # active console encoding (common on Windows when stdout is cp1252).
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="backslashreplace")
        except Exception:
            pass


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _run_cmd_capture(args: list[str]) -> tuple[int, str, str]:
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.returncode, (proc.stdout or ""), (proc.stderr or "")


def _run_cmd_capture_ok(args: list[str]) -> str:
    code, out, err = _run_cmd_capture(args)
    if code != 0:
        raise RuntimeError(err.strip() or out.strip() or f"command failed: {' '.join(args)}")
    return out


def _git_sha() -> str:
    code, out, _ = _run_cmd_capture(["git", "rev-parse", "HEAD"])
    out = out.strip()
    return out if code == 0 and out else "unknown"


def _git_short_sha() -> str:
    code, out, _ = _run_cmd_capture(["git", "rev-parse", "--short", "HEAD"])
    out = out.strip()
    return out if code == 0 and out else "unknown"


def _default_run_id() -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{ts}-{_git_short_sha()}"


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _safe_load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _shell_quote(arg: str) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline([arg])
    return shlex.quote(arg)


@dataclass
class ToolResult:
    tool_id: str
    tier: int
    required: bool
    enabled: bool
    status: str  # pass|fail|warn|skipped
    exit_code: int | None
    started_at: str
    finished_at: str
    duration_ms: int
    command: str | None
    skipped_reason: str | None
    attempts: int
    result_source: str  # computed|reused


def _validate_matrix(matrix: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(matrix, dict) or "tools" not in matrix or not isinstance(matrix["tools"], list):
        raise ValueError("audit-matrix.yml must be a mapping with a top-level 'tools:' list")

    tools: list[dict[str, Any]] = []
    for t in matrix["tools"]:
        if not isinstance(t, dict):
            raise ValueError("Each tool entry must be a mapping")
        if not t.get("id"):
            raise ValueError("Tool is missing required field: id")
        if not t.get("tier"):
            raise ValueError(f"Tool {t.get('id')} is missing required field: tier")
        tools.append(t)
    return tools


def _tiers_for_mode(mode: str) -> set[int]:
    if mode == "pr":
        return {1, 2}
    if mode == "main":
        return {1, 2}
    if mode == "nightly":
        return {1, 2, 3}
    if mode == "release":
        return {1, 3}
    raise ValueError(f"unknown mode: {mode}")


def _selected_tiers(tier_arg: str) -> set[int]:
    if tier_arg == "all":
        return {1, 2, 3}
    return {int(tier_arg)}


def _tool_is_selected(tool: dict[str, Any], tiers: set[int]) -> bool:
    try:
        tier = int(tool.get("tier"))
    except Exception:
        return False
    return tier in tiers


def _tool_env_ok(tool: dict[str, Any]) -> tuple[bool, str | None]:
    requires_env = tool.get("requires_env") or []
    if not requires_env:
        return True, None
    missing = [name for name in requires_env if not os.environ.get(name)]
    if missing:
        return False, f"missing env: {', '.join(sorted(missing))}"
    return True, None


def _resolve_command(
    tool: dict[str, Any],
    scope: str,
    affected_result: affected.AffectedResult | None,
) -> tuple[str | None, str | None]:
    """
    Resolve the command to execute, possibly rewriting for affected-only scope.

    Returns: (command, skip_reason)
    """
    command = tool.get("command")
    tool_id = str(tool.get("id") or "")

    turbo_cache_flags: list[str] = []
    if os.environ.get("TURBO_REMOTE_CACHE_READ_ONLY"):
        turbo_cache_flags.append("--remote-cache-read-only")
    if os.environ.get("TURBO_FORCE"):
        turbo_cache_flags.append("--force")
    turbo_cache = " ".join(turbo_cache_flags).strip()

    if scope != "affected" or affected_result is None:
        # Only rewrite turbo tasks in full-scope when explicit cache flags are requested.
        if tool_id in {"turbo-typecheck", "turbo-build", "turbo-test-coverage"} and turbo_cache:
            task = {
                "turbo-typecheck": "typecheck",
                "turbo-build": "build",
                "turbo-test-coverage": "test:coverage",
            }[tool_id]
            return (f"pnpm exec turbo run {task} {turbo_cache}".strip(), None)
        return (command, None)

    affected_pkgs = list(affected_result.packages)
    affected_plus = list(affected_result.packages_with_dependents)

    # Tier 1 build/typecheck/test: affected packages + dependents
    if tool_id in {"turbo-typecheck", "turbo-build", "turbo-test-coverage"}:
        if not affected_plus:
            return (None, "no affected packages")
        task = {
            "turbo-typecheck": "typecheck",
            "turbo-build": "build",
            "turbo-test-coverage": "test:coverage",
        }[tool_id]
        filters = " ".join([f"--filter={_shell_quote(p)}" for p in affected_plus])
        return (f"pnpm exec turbo run {task} {turbo_cache} {filters}".strip(), None)

    # Tier 1 lint: only affected packages (no dependents)
    if tool_id == "eslint-max-warnings-0":
        if affected_result.global_change:
            return (command, None)
        if not affected_pkgs:
            return (None, "no affected packages")
        name_to_path = {p.name: p.path for p in affected.get_turbo_packages()}
        paths = [name_to_path[p] for p in affected_pkgs if p in name_to_path]
        if not paths:
            return (None, "no affected package paths")
        path_args = " ".join([_shell_quote(p) for p in sorted(set(paths))])
        return (f"pnpm exec eslint --max-warnings=0 {path_args}".strip(), None)

    # Tier 1 format: prefer changed files; fall back to full check if too many
    if tool_id == "prettier-check":
        if affected_result.global_change:
            return (command, None)
        exts = {".ts", ".tsx", ".md", ".json", ".yml", ".yaml", ".js", ".jsx"}
        files = []
        for f in affected_result.changed_files:
            p = (REPO_ROOT / f).resolve()
            if not p.exists():
                continue
            if p.suffix.lower() in exts:
                files.append(f)
        files = sorted(set(files))
        if not files:
            return (None, "no prettier-relevant files")
        if len(files) > 200:
            return (command, None)
        args = " ".join([_shell_quote(f) for f in files])
        return (f"pnpm exec prettier --check {args}".strip(), None)

    return (command, None)


def _load_existing_summary(run_dir: Path) -> dict[str, Any] | None:
    path = run_dir / "summary.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _existing_tool_index(existing: dict[str, Any]) -> dict[str, dict[str, Any]]:
    tools = existing.get("tools")
    if not isinstance(tools, list):
        return {}
    index: dict[str, dict[str, Any]] = {}
    for t in tools:
        if isinstance(t, dict) and t.get("id"):
            index[str(t["id"])] = t
    return index


def _tail_file(path: Path, lines: int) -> str:
    try:
        content = path.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(content[-lines:])
    except Exception:
        return ""


def _run_tool(
    run_dir: Path,
    tool: dict[str, Any],
    scope: str,
    affected_result: affected.AffectedResult | None,
    existing_tool: dict[str, Any] | None,
    resume: bool,
) -> ToolResult:
    tool_id = str(tool["id"])
    tier = int(tool["tier"])
    enabled = bool(tool.get("enabled", True))
    required = bool(tool.get("required", False))

    cmd_path = run_dir / f"{tool_id}.command.txt"
    log_path = run_dir / f"{tool_id}.log"
    exit_path = run_dir / f"{tool_id}.exit"

    started_at = _utc_now()
    start_monotonic = time.monotonic()

    # Skip disabled tools (but still emit evidence stubs for determinism).
    if not enabled:
        finished_at = _utc_now()
        _write_text(cmd_path, (str(tool.get("command") or "").strip()) + "\n")
        _write_text(log_path, f"[audit] tool={tool_id} tier={tier} required={required}\n[audit] skipped_reason=disabled\n")
        _write_text(exit_path, "SKIPPED\n")
        return ToolResult(
            tool_id=tool_id,
            tier=tier,
            required=required,
            enabled=enabled,
            status="skipped",
            exit_code=None,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=int((time.monotonic() - start_monotonic) * 1000),
            command=tool.get("command"),
            skipped_reason="disabled in matrix",
            attempts=0,
            result_source="computed",
        )

    env_ok, env_reason = _tool_env_ok(tool)
    if not env_ok:
        finished_at = _utc_now()
        _write_text(cmd_path, (str(tool.get("command") or "").strip()) + "\n")
        _write_text(log_path, f"[audit] tool={tool_id} tier={tier} required={required}\n[audit] skipped_reason={env_reason}\n")
        _write_text(exit_path, "SKIPPED\n")
        return ToolResult(
            tool_id=tool_id,
            tier=tier,
            required=required,
            enabled=enabled,
            status="skipped",
            exit_code=None,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=int((time.monotonic() - start_monotonic) * 1000),
            command=tool.get("command"),
            skipped_reason=env_reason,
            attempts=0,
            result_source="computed",
        )

    resolved_command, scope_skip = _resolve_command(tool, scope=scope, affected_result=affected_result)
    if scope_skip:
        finished_at = _utc_now()
        _write_text(cmd_path, (str(resolved_command or "").strip()) + "\n")
        _write_text(
            log_path,
            f"[audit] tool={tool_id} tier={tier} required={required}\n[audit] skipped_reason={scope_skip}\n",
        )
        _write_text(exit_path, "SKIPPED\n")
        return ToolResult(
            tool_id=tool_id,
            tier=tier,
            required=required,
            enabled=enabled,
            status="skipped",
            exit_code=None,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=int((time.monotonic() - start_monotonic) * 1000),
            command=resolved_command,
            skipped_reason=scope_skip,
            attempts=0,
            result_source="computed",
        )

    if resolved_command is None:
        finished_at = _utc_now()
        _write_text(cmd_path, "\n")
        _write_text(log_path, f"[audit] tool={tool_id} tier={tier} required={required}\n[audit] skipped_reason=no command\n")
        _write_text(exit_path, "SKIPPED\n")
        return ToolResult(
            tool_id=tool_id,
            tier=tier,
            required=required,
            enabled=enabled,
            status="skipped",
            exit_code=None,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=int((time.monotonic() - start_monotonic) * 1000),
            command=None,
            skipped_reason="no local command (CI-only or manual)",
            attempts=0,
            result_source="computed",
        )

    # Resume: reuse passing/skipped results if command and evidence match.
    if resume and existing_tool:
        prev_status = str(existing_tool.get("status") or "")
        prev_cmd = existing_tool.get("command")
        prev_skip = existing_tool.get("skipped_reason")
        evidence_ok = cmd_path.exists() and log_path.exists() and exit_path.exists()
        can_reuse_skip = prev_status == "skipped" and prev_skip and _tool_env_ok(tool)[1] is not None
        can_reuse = prev_status in {"pass"} or can_reuse_skip
        if can_reuse and evidence_ok and prev_cmd == resolved_command:
            finished_at = _utc_now()
            return ToolResult(
                tool_id=tool_id,
                tier=tier,
                required=required,
                enabled=enabled,
                status=prev_status,
                exit_code=existing_tool.get("exit_code"),
                started_at=str(existing_tool.get("started_at") or started_at),
                finished_at=str(existing_tool.get("finished_at") or finished_at),
                duration_ms=int(existing_tool.get("duration_ms") or 0),
                command=resolved_command,
                skipped_reason=prev_skip,
                attempts=int(existing_tool.get("attempts") or 0),
                result_source="reused",
            )

    _write_text(cmd_path, resolved_command.strip() + "\n")

    workdir = tool.get("workdir")
    cwd = str(REPO_ROOT if not workdir else (REPO_ROOT / str(workdir)).resolve())

    retries = int(tool.get("retries") or 0)
    backoff = tool.get("backoff_seconds") or [5, 15]
    backoff_seconds = [int(x) for x in backoff] if isinstance(backoff, list) else [5, 15]

    attempt = 0
    exit_code: int | None = None
    with log_path.open("w", encoding="utf-8") as log_file:
        log_file.write(f"[audit] tool={tool_id} tier={tier} required={required}\n")
        log_file.write(f"[audit] started_at={started_at}\n")
        log_file.write(f"[audit] cwd={cwd}\n")
        log_file.write(f"[audit] command={resolved_command}\n")
        log_file.flush()

        while True:
            attempt += 1
            if attempt > 1:
                log_file.write(f"\n[audit] retry_attempt={attempt}\n")
                log_file.flush()

            proc = subprocess.Popen(
                resolved_command,
                shell=True,
                cwd=cwd,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
                env=os.environ.copy(),
            )
            exit_code = proc.wait()

            if exit_code == 0 or attempt > retries + 1:
                break

            # Backoff before retry
            idx = min(attempt - 2, len(backoff_seconds) - 1)
            sleep_s = backoff_seconds[idx] if backoff_seconds else 5
            log_file.write(f"[audit] retry_backoff_seconds={sleep_s}\n")
            log_file.flush()
            time.sleep(sleep_s)

    _write_text(exit_path, str(exit_code) + "\n")

    finished_at = _utc_now()
    duration_ms = int((time.monotonic() - start_monotonic) * 1000)

    status = "pass" if exit_code == 0 else ("fail" if required and tier == 1 else "warn")
    return ToolResult(
        tool_id=tool_id,
        tier=tier,
        required=required,
        enabled=enabled,
        status=status,
        exit_code=exit_code,
        started_at=started_at,
        finished_at=finished_at,
        duration_ms=duration_ms,
        command=resolved_command,
        skipped_reason=None,
        attempts=attempt,
        result_source="computed",
    )


def _compute_aggregate_result(tools: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {"pass": 0, "fail": 0, "warn": 0, "skipped": 0}
    tier1_required_failed = 0
    tier2_warn = 0
    tier3_warn = 0

    for t in tools:
        status = t.get("status")
        if status in counts:
            counts[status] += 1
        if (
            int(t.get("tier", 0)) == 1
            and bool(t.get("required"))
            and bool(t.get("enabled", True))
            and status != "pass"
        ):
            tier1_required_failed += 1
        if int(t.get("tier", 0)) == 2 and status in {"warn", "fail"}:
            tier2_warn += 1
        if int(t.get("tier", 0)) == 3 and status in {"warn", "fail"}:
            tier3_warn += 1

    overall = "pass"
    if tier1_required_failed > 0:
        overall = "fail"
    elif tier2_warn > 0 or tier3_warn > 0:
        overall = "warn"

    return {
        "overall_status": overall,
        "counts": counts,
        "tier1_required_failed": tier1_required_failed,
        "tier2_warn_or_fail": tier2_warn,
        "tier3_warn_or_fail": tier3_warn,
    }


def _merge_summaries(existing: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    """
    Merge multiple invocations into a single run-id bundle summary.

    The merge is intentionally conservative: it only merges when commit+matrix hash match.
    """
    if not isinstance(existing, dict):
        return new

    if existing.get("commit_sha") != new.get("commit_sha"):
        return new
    if existing.get("matrix_sha256") != new.get("matrix_sha256"):
        return new

    merged = dict(new)

    tiers_existing = set(existing.get("tiers_requested") or [])
    tiers_new = set(new.get("tiers_requested") or [])
    merged["tiers_requested"] = sorted({*tiers_existing, *tiers_new})

    existing_tools = {t.get("id"): t for t in (existing.get("tools") or []) if isinstance(t, dict) and t.get("id")}
    for t in new.get("tools") or []:
        if isinstance(t, dict) and t.get("id"):
            existing_tools[t["id"]] = t
    merged["tools"] = [existing_tools[k] for k in sorted(existing_tools.keys())]

    try:
        merged["started_at"] = min(str(existing.get("started_at")), str(new.get("started_at")))
        merged["finished_at"] = max(str(existing.get("finished_at")), str(new.get("finished_at")))
    except Exception:
        pass

    if merged.get("mode") is None and existing.get("mode") is not None:
        merged["mode"] = existing.get("mode")
    if merged.get("scope") is None and existing.get("scope") is not None:
        merged["scope"] = existing.get("scope")

    merged["generated_at"] = _utc_now()
    merged["result"] = _compute_aggregate_result(merged.get("tools") or [])
    return merged


def _render_summary_md(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"# System Audit Summary ({summary.get('run_id')})")
    lines.append("")
    lines.append(f"- Commit: `{summary.get('commit_sha')}`")
    lines.append(f"- Mode: `{summary.get('mode')}`")
    lines.append(f"- Scope: `{summary.get('scope')}`")
    if summary.get("matrix_sha256"):
        lines.append(f"- Matrix SHA256: `{summary.get('matrix_sha256')}`")
    lines.append(f"- Started: `{summary.get('started_at')}`")
    lines.append(f"- Finished: `{summary.get('finished_at')}`")
    lines.append(f"- Result: `{summary.get('result', {}).get('overall_status')}`")
    lines.append("")

    affected_meta = summary.get("affected")
    if isinstance(affected_meta, dict) and affected_meta.get("report_dir"):
        lines.append("## Affected")
        lines.append("")
        lines.append(f"- Base ref: `{affected_meta.get('base_ref')}`")
        lines.append(f"- Merge base: `{affected_meta.get('merge_base')}`")
        lines.append(f"- Report: `{affected_meta.get('report_dir')}`")
        lines.append("")

    if summary.get("tool_versions_path"):
        lines.append("## Tool Versions")
        lines.append("")
        lines.append(f"- `{summary.get('tool_versions_path')}`")
        lines.append("")

    lines.append("## Tools")
    lines.append("")
    lines.append("| Tier | Tool | Enabled | Required | Status | Exit | Source | Reason | Evidence |")
    lines.append("|------|------|---------|----------|--------|------|--------|--------|----------|")
    for t in summary.get("tools") or []:
        tool_id = t.get("id")
        tier = t.get("tier")
        enabled = "yes" if t.get("enabled", True) else "no"
        required = "yes" if t.get("required") else "no"
        status = t.get("status")
        exit_code = t.get("exit_code")
        exit_display = exit_code if exit_code is not None else "None"
        source = t.get("result_source") or "computed"
        reason = ""
        if status == "skipped":
            reason = t.get("skipped_reason") or ""
            reason = reason.replace("|", "\\|")
        evidence = f"`{tool_id}.log`"
        lines.append(
            f"| {tier} | `{tool_id}` | {enabled} | {required} | {status} | {exit_display} | {source} | {reason} | {evidence} |"
        )
    lines.append("")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run tiered system audits and emit run-id evidence bundles.")
    parser.add_argument("--tier", choices=["1", "2", "3", "all"], default=None, help="Tier to run (1|2|3|all).")
    parser.add_argument(
        "--mode",
        choices=["pr", "main", "nightly", "release"],
        default=None,
        help="Optional mode preset (sets default tiers + scope).",
    )
    parser.add_argument(
        "--scope",
        choices=["full", "affected"],
        default=None,
        help="Execution scope (default: derived from --mode, else full).",
    )
    parser.add_argument("--base-ref", default="origin/main", help="Base ref for affected computation.")
    parser.add_argument("--resume", action="store_true", help="Reuse prior passing results for the same run-id+SHA.")
    parser.add_argument(
        "--concurrency",
        type=int,
        default=1,
        help="Max parallel tools to run (default: 1).",
    )
    parser.add_argument("--matrix-path", default=str(DEFAULT_MATRIX_PATH), help="Path to audit-matrix.yml")
    parser.add_argument("--run-id", default=None, help="Optional run id (defaults to UTC timestamp + short SHA).")
    parser.add_argument(
        "--output-root",
        default=str(DEFAULT_OUTPUT_ROOT),
        help="Root output directory for audit bundles (default: artifacts/reports/system-audit).",
    )
    parser.add_argument(
        "--fail-on-warn",
        action="store_true",
        help="Fail (exit 1) if any Tier 2/3 tool warns/fails.",
    )
    args = parser.parse_args(argv)

    _configure_stdio()

    if args.tier is None and args.mode is None:
        parser.error("must provide --tier or --mode")

    mode = args.mode
    tiers = _selected_tiers(args.tier) if args.tier else _tiers_for_mode(mode)

    scope = args.scope
    if scope is None:
        scope = "affected" if mode == "pr" else "full"
    if scope not in {"full", "affected"}:
        parser.error("invalid scope")

    matrix_path = Path(args.matrix_path).resolve()
    matrix_sha256 = _sha256_file(matrix_path)
    matrix = _safe_load_yaml(matrix_path)
    tools = _validate_matrix(matrix)

    run_id = args.run_id or _default_run_id()
    output_root = Path(args.output_root).resolve()
    run_dir = output_root / run_id
    _ensure_dir(run_dir)

    # Capture tool versions (best-effort).
    tool_versions_path = run_dir / "tool-versions.json"
    try:
        tool_versions_path.write_text(
            json.dumps(tool_versions.collect_versions(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    except Exception:
        pass

    commit_sha = _git_sha()
    started_at = _utc_now()

    affected_result: affected.AffectedResult | None = None
    affected_meta: dict[str, Any] | None = None
    if scope == "affected":
        try:
            affected_result, warnings = affected.compute_affected(args.base_ref, include_dependents=True)
            affected.write_outputs(affected_result, affected.DEFAULT_OUTPUT_DIR)
            affected_meta = {
                "base_ref": affected_result.base_ref,
                "merge_base": affected_result.merge_base,
                "report_dir": os.path.relpath(affected.DEFAULT_OUTPUT_DIR, REPO_ROOT).replace("\\", "/"),
                "warnings": warnings,
            }
        except Exception as e:
            affected_meta = {
                "base_ref": args.base_ref,
                "error": str(e),
            }

    existing_summary = _load_existing_summary(run_dir) if args.resume else None
    existing_ok = (
        existing_summary
        and existing_summary.get("commit_sha") == commit_sha
        and existing_summary.get("matrix_sha256") == matrix_sha256
    )
    existing_tool_index = _existing_tool_index(existing_summary) if existing_ok else {}

    selected_tools = [t for t in tools if _tool_is_selected(t, tiers)]
    selected_tools_sorted = sorted(selected_tools, key=lambda x: (int(x.get("tier")), str(x.get("id"))))

    results: list[ToolResult] = []

    def run_one(tool: dict[str, Any]) -> ToolResult:
        tool_id = str(tool["id"])
        return _run_tool(
            run_dir,
            tool,
            scope=scope,
            affected_result=affected_result,
            existing_tool=existing_tool_index.get(tool_id),
            resume=bool(existing_ok and args.resume),
        )

    if args.concurrency <= 1:
        for tool in selected_tools_sorted:
            r = run_one(tool)
            results.append(r)
            print(f"[audit] {r.tool_id} tier={r.tier} status={r.status} source={r.result_source}")
            if r.status in {"fail"}:
                tail = _tail_file(run_dir / f"{r.tool_id}.log", 20)
                if tail:
                    print(f"[audit] tail({r.tool_id}.log):\n{tail}")
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
            futures = [executor.submit(run_one, t) for t in selected_tools_sorted]
            for fut in concurrent.futures.as_completed(futures):
                results.append(fut.result())

        results = sorted(results, key=lambda r: (r.tier, r.tool_id))
        for r in results:
            print(f"[audit] {r.tool_id} tier={r.tier} status={r.status} source={r.result_source}")

    finished_at = _utc_now()

    summary_tools: list[dict[str, Any]] = []
    for r in results:
        summary_tools.append(
            {
                "id": r.tool_id,
                "tier": r.tier,
                "required": r.required,
                "enabled": r.enabled,
                "status": r.status,
                "exit_code": r.exit_code,
                "started_at": r.started_at,
                "finished_at": r.finished_at,
                "duration_ms": r.duration_ms,
                "command": r.command,
                "skipped_reason": r.skipped_reason,
                "attempts": r.attempts,
                "result_source": r.result_source,
            }
        )

    summary: dict[str, Any] = {
        "schema_version": "1.1.0",
        "run_id": run_id,
        "mode": mode,
        "scope": scope,
        "matrix_path": os.path.relpath(matrix_path, REPO_ROOT).replace("\\", "/"),
        "matrix_sha256": matrix_sha256,
        "tiers_requested": sorted([str(t) for t in tiers]),
        "generated_at": _utc_now(),
        "started_at": started_at,
        "finished_at": finished_at,
        "commit_sha": commit_sha,
        "tool_versions_path": os.path.relpath(tool_versions_path, REPO_ROOT).replace("\\", "/")
        if tool_versions_path.exists()
        else None,
        "affected": affected_meta,
        "runner": {
            "platform": platform.platform(),
            "github_actions": bool(os.environ.get("GITHUB_ACTIONS")),
            "identity": os.environ.get("GITHUB_ACTOR") or os.environ.get("USERNAME") or os.environ.get("USER") or "",
        },
        "cache": {
            "turbo_token_present": bool(os.environ.get("TURBO_TOKEN")),
            "turbo_team_present": bool(os.environ.get("TURBO_TEAM")),
            "turbo_remote_cache_read_only": bool(
                os.environ.get("TURBO_REMOTE_CACHE_READ_ONLY") or os.environ.get("TURBO_REMOTE_ONLY")
            ),
        },
        "tools": [t for t in sorted(summary_tools, key=lambda x: (int(x["tier"]), str(x["id"])))],
    }

    summary_json_path = run_dir / "summary.json"
    summary_md_path = run_dir / "summary.md"
    summary["result"] = _compute_aggregate_result(summary["tools"])

    if summary_json_path.exists():
        try:
            existing = json.loads(summary_json_path.read_text(encoding="utf-8"))
            summary = _merge_summaries(existing, summary)
        except Exception:
            pass

    _write_json(summary_json_path, summary)
    _write_text(summary_md_path, _render_summary_md(summary))

    tier1_failed = int(summary["result"]["tier1_required_failed"])
    warn_or_fail = int(summary["result"]["tier2_warn_or_fail"]) + int(summary["result"]["tier3_warn_or_fail"])

    if tier1_failed > 0:
        return 1
    if args.fail_on_warn and warn_or_fail > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
