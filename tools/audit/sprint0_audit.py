#!/usr/bin/env python
from __future__ import annotations

import argparse
import csv
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from glob import glob
from pathlib import Path
from typing import Any

import attestation
import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLAN_PATH = REPO_ROOT / "apps" / "project-tracker" / "docs" / "metrics" / "_global" / "Sprint_plan.csv"
DEFAULT_OVERRIDES_PATH = REPO_ROOT / "apps" / "project-tracker" / "docs" / "metrics" / "plan-overrides.yaml"
DEFAULT_CUTOVER_PATH = REPO_ROOT / "audit-cutover.yml"
DEFAULT_ATTESTATIONS_DIR = REPO_ROOT / "artifacts" / "attestations"
DEFAULT_AUDIT_BUNDLES_DIR = REPO_ROOT / "artifacts" / "reports" / "system-audit"
DEFAULT_REPORTS_DIR = REPO_ROOT / "artifacts" / "reports"
DEFAULT_DEBT_LEDGER_PATH = REPO_ROOT / "docs" / "debt-ledger.yaml"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _read_csv_plan(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows: list[dict[str, str]] = []
        for row in reader:
            rows.append({k: (v or "").strip() for k, v in row.items()})
        return rows


def _safe_load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _safe_load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _git_merge_base_is_ancestor(ancestor: str, descendant: str) -> bool:
    proc = subprocess.run(["git", "merge-base", "--is-ancestor", ancestor, descendant])
    return proc.returncode == 0


def _git_last_commit_for_path(path: Path) -> tuple[str | None, int | None]:
    if not path.exists():
        return None, None
    rel = str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    proc = subprocess.run(
        ["git", "log", "-1", "--format=%H %ct", "--", rel],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return None, None
    out = (proc.stdout or "").strip()
    if not out:
        return None, None
    sha, ts = out.split(" ", 1)
    try:
        return sha.strip(), int(ts.strip())
    except Exception:
        return sha.strip(), None


def _infer_task_commit(task_id: str) -> tuple[str | None, int | None]:
    candidates: list[tuple[str | None, int | None]] = []
    spec = REPO_ROOT / ".specify" / "specifications" / f"{task_id}.md"
    plan = REPO_ROOT / ".specify" / "planning" / f"{task_id}.md"
    for p in (spec, plan):
        candidates.append(_git_last_commit_for_path(p))
    best_sha: str | None = None
    best_ts: int | None = None
    for sha, ts in candidates:
        if sha is None:
            continue
        if best_ts is None or (ts is not None and ts >= best_ts):
            best_sha, best_ts = sha, ts
    return best_sha, best_ts


def _task_is_post_cutover(
    task_commit_sha: str | None,
    task_commit_ts: int | None,
    cutover: dict[str, Any],
) -> bool | None:
    cutover_sha = cutover.get("cutover_sha")
    cutover_time = cutover.get("cutover_time")
    if task_commit_sha is None:
        return None
    if cutover_sha:
        try:
            return _git_merge_base_is_ancestor(str(cutover_sha), task_commit_sha)
        except Exception:
            return None
    if cutover_time:
        try:
            cut_ts = int(datetime.fromisoformat(str(cutover_time).replace("Z", "+00:00")).timestamp())
        except Exception:
            return None
        if task_commit_ts is None:
            return None
        return task_commit_ts >= cut_ts
    return None


def _load_overrides_tiers(overrides: dict[str, Any]) -> dict[str, str]:
    reserved = {"schema_version", "last_updated", "maintainer", "gate_profiles", "_meta"}
    tiers: dict[str, str] = {}
    for k, v in overrides.items():
        if k in reserved:
            continue
        if isinstance(v, dict) and v.get("tier"):
            tiers[str(k)] = str(v.get("tier")).strip()
    return tiers


def _load_overrides_evidence(overrides: dict[str, Any]) -> dict[str, list[str]]:
    reserved = {"schema_version", "last_updated", "maintainer", "gate_profiles", "_meta"}
    evidence: dict[str, list[str]] = {}
    for k, v in overrides.items():
        if k in reserved:
            continue
        if isinstance(v, dict):
            req = v.get("evidence_required") or []
            if isinstance(req, list):
                evidence[str(k)] = [str(x).strip() for x in req if str(x).strip()]
    return evidence


def _load_overrides_debt(overrides: dict[str, Any]) -> dict[str, dict[str, Any]]:
    reserved = {"schema_version", "last_updated", "maintainer", "gate_profiles", "_meta"}
    debt: dict[str, dict[str, Any]] = {}
    for k, v in overrides.items():
        if k in reserved:
            continue
        if isinstance(v, dict):
            debt[str(k)] = {
                "debt_allowed": v.get("debt_allowed"),
                "waiver_expiry": v.get("waiver_expiry"),
            }
    return debt


def _parse_artifacts_to_track(value: str) -> list[str]:
    if not value:
        return []
    parts = [p.strip() for p in value.split(",")]
    return [p for p in parts if p]


def _path_glob_exists(pattern: str) -> bool:
    if not pattern:
        return False
    normalized = pattern.replace("\\", "/")
    abs_pattern = str((REPO_ROOT / normalized).resolve())
    matches = glob(abs_pattern, recursive=True)
    return len(matches) > 0


def _path_exists(path_str: str) -> bool:
    if "*" in path_str or "?" in path_str or "[" in path_str:
        return _path_glob_exists(path_str)
    return (REPO_ROOT / path_str).resolve().exists()


def _required_evidence_for_task(
    task_id: str,
    csv_row: dict[str, str],
    overrides_evidence: dict[str, list[str]],
) -> list[str]:
    required = []
    required.append(f".specify/specifications/{task_id}.md")
    required.append(f".specify/planning/{task_id}.md")
    required.extend(overrides_evidence.get(task_id, []))
    required.extend(_parse_artifacts_to_track(csv_row.get("Artifacts To Track") or ""))

    uniq: list[str] = []
    seen: set[str] = set()
    for p in required:
        norm = p.strip()
        if not norm or norm in seen:
            continue
        seen.add(norm)
        uniq.append(norm)
    return uniq


def _load_debt_ledger(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"items": {}}
    data = _safe_load_yaml(path)
    if not isinstance(data, dict):
        return {"items": {}}
    items = data.get("items") or {}
    return {"raw": data, "items": items if isinstance(items, dict) else {}}


def _find_debt_for_task(debt_items: dict[str, Any], task_id: str) -> list[str]:
    matches: list[str] = []
    for debt_id, entry in debt_items.items():
        if not isinstance(entry, dict):
            continue
        if str(entry.get("origin_task") or "").strip() == task_id:
            matches.append(str(debt_id))
    return sorted(matches)


@dataclass
class TaskAudit:
    task_id: str
    status: str
    tier: str | None
    is_post_cutover: bool | None
    inferred_commit_sha: str | None
    evidence_missing: list[str]
    attestation_missing: bool
    attestation_invalid: bool
    attestation_errors: list[str]
    audit_bundle_missing: bool
    tier1_pass: bool | None
    debt_ids: list[str]
    classification: str
    reasons: list[str]


def _load_audit_bundle_summary(audit_bundles_dir: Path, run_id: str) -> dict[str, Any] | None:
    summary_path = audit_bundles_dir / run_id / "summary.json"
    if not summary_path.exists():
        return None
    try:
        return _safe_load_json(summary_path)
    except Exception:
        return None


def _tier1_required_passed(summary: dict[str, Any]) -> bool | None:
    result = summary.get("result")
    if isinstance(result, dict):
        failed = result.get("tier1_required_failed")
        if isinstance(failed, int):
            return failed == 0

    tools = summary.get("tools")
    if not isinstance(tools, list):
        return None
    required_tier1 = [
        t
        for t in tools
        if int(t.get("tier", 0)) == 1 and bool(t.get("required")) and t.get("enabled", True) is not False
    ]
    if not required_tier1:
        return None
    return all(t.get("status") == "pass" for t in required_tier1)


def _audit_task(
    row: dict[str, str],
    tiers: dict[str, str],
    overrides_evidence: dict[str, list[str]],
    overrides_debt: dict[str, dict[str, Any]],
    cutover: dict[str, Any],
    debt_items: dict[str, Any],
    attestations_dir: Path,
    audit_bundles_dir: Path,
    run_id: str | None,
) -> TaskAudit:
    task_id = row.get("Task ID") or ""
    status = row.get("Status") or ""
    tier = tiers.get(task_id)

    inferred_commit_sha, inferred_commit_ts = _infer_task_commit(task_id)
    post_cutover = _task_is_post_cutover(inferred_commit_sha, inferred_commit_ts, cutover)

    required_evidence = _required_evidence_for_task(task_id, row, overrides_evidence)
    evidence_missing = sorted([p for p in required_evidence if not _path_exists(p)])

    attestation_path = attestations_dir / f"{task_id}.json"
    attestation_missing = not attestation_path.exists()
    attestation_invalid = False
    attestation_errors: list[str] = []
    if not attestation_missing:
        v = attestation.validate_attestation_file(attestation_path, audit_bundles_dir=audit_bundles_dir)
        if not v.ok:
            attestation_invalid = True
            attestation_errors = v.errors

    audit_bundle_missing = False
    tier1_pass: bool | None = None
    if run_id:
        summary = _load_audit_bundle_summary(audit_bundles_dir, run_id)
        audit_bundle_missing = summary is None
        if summary is not None:
            tier1_pass = _tier1_required_passed(summary)

    debt_ids = _find_debt_for_task(debt_items, task_id)

    reasons: list[str] = []
    is_completed = status.strip().lower() == "completed"
    if tier == "A" and is_completed:
        reasons.append("TIER_A_MUST_REVIEW")
    if evidence_missing and is_completed:
        reasons.append("MISSING_EVIDENCE_PACK")
    if post_cutover is True and attestation_missing and is_completed:
        reasons.append("MISSING_ATTESTATION")
    if post_cutover is True and attestation_invalid and is_completed:
        reasons.append("INVALID_ATTESTATION")
    if run_id and audit_bundle_missing and is_completed:
        reasons.append("MISSING_AUDIT_BUNDLE")
    if run_id and tier1_pass is False and is_completed:
        reasons.append("TIER1_FAILED")

    debt_allowed = (overrides_debt.get(task_id) or {}).get("debt_allowed")
    waiver_expiry = (overrides_debt.get(task_id) or {}).get("waiver_expiry")
    has_debt_policy = str(debt_allowed).strip().lower() == "yes"

    classification = "In Review"
    if not is_completed:
        classification = "Not Completed"
    else:
        if post_cutover is True:
            if (not evidence_missing) and (not attestation_missing) and (not attestation_invalid) and (
                tier1_pass in {True, None}
            ):
                classification = "Operational Completed"
            else:
                classification = "In Review"
        else:
            if not evidence_missing:
                classification = "Verified"
            elif has_debt_policy and waiver_expiry and debt_ids:
                classification = "Debt Accepted"
                reasons.append("WAIVER_PRESENT")
            else:
                classification = "In Review"

    return TaskAudit(
        task_id=task_id,
        status=status,
        tier=tier,
        is_post_cutover=post_cutover,
        inferred_commit_sha=inferred_commit_sha,
        evidence_missing=evidence_missing,
        attestation_missing=attestation_missing,
        attestation_invalid=attestation_invalid,
        attestation_errors=attestation_errors,
        audit_bundle_missing=audit_bundle_missing,
        tier1_pass=tier1_pass,
        debt_ids=debt_ids,
        classification=classification,
        reasons=sorted(set(reasons)),
    )


def _render_debt_ledger(debt_raw: dict[str, Any], out_md: Path, out_jsonl: Path) -> None:
    items = (debt_raw or {}).get("items") or {}
    if not isinstance(items, dict):
        items = {}

    lines = []
    for debt_id in sorted(items.keys()):
        entry = items[debt_id]
        if not isinstance(entry, dict):
            continue
        obj = dict(entry)
        obj["debt_id"] = debt_id
        lines.append(json.dumps(obj, sort_keys=True))
    out_jsonl.parent.mkdir(parents=True, exist_ok=True)
    out_jsonl.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

    md_lines = []
    md_lines.append("# Debt Ledger (Rendered)")
    md_lines.append("")
    md_lines.append("| Debt ID | Origin Task | Owner | Severity | Expiry | Status |")
    md_lines.append("|--------:|------------|-------|----------|--------|--------|")
    for debt_id in sorted(items.keys()):
        entry = items[debt_id]
        if not isinstance(entry, dict):
            continue
        md_lines.append(
            "| {debt_id} | `{origin}` | {owner} | {severity} | {expiry} | {status} |".format(
                debt_id=debt_id,
                origin=str(entry.get("origin_task") or ""),
                owner=str(entry.get("owner") or ""),
                severity=str(entry.get("severity") or ""),
                expiry=str(entry.get("expiry_date") or ""),
                status=str(entry.get("status") or ""),
            )
        )
    md_lines.append("")
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(md_lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate Sprint 0 audit report + review queue.")
    parser.add_argument("--plan-path", default=str(DEFAULT_PLAN_PATH), help="Path to Sprint_plan.csv")
    parser.add_argument("--overrides-path", default=str(DEFAULT_OVERRIDES_PATH), help="Path to plan-overrides.yaml")
    parser.add_argument("--cutover-path", default=str(DEFAULT_CUTOVER_PATH), help="Path to audit-cutover.yml")
    parser.add_argument("--attestations-dir", default=str(DEFAULT_ATTESTATIONS_DIR), help="Attestations directory")
    parser.add_argument("--audit-bundles-dir", default=str(DEFAULT_AUDIT_BUNDLES_DIR), help="Audit bundles root")
    parser.add_argument("--reports-dir", default=str(DEFAULT_REPORTS_DIR), help="Output directory (artifacts/reports).")
    parser.add_argument("--run-id", default=None, help="Optional run-id to link (expects bundle summary.json).")
    args = parser.parse_args(argv)

    plan_rows = _read_csv_plan(Path(args.plan_path).resolve())
    overrides = _safe_load_yaml(Path(args.overrides_path).resolve()) or {}
    cutover = _safe_load_yaml(Path(args.cutover_path).resolve()) or {}
    debt = _load_debt_ledger(DEFAULT_DEBT_LEDGER_PATH)

    tiers = _load_overrides_tiers(overrides)
    overrides_evidence = _load_overrides_evidence(overrides)
    overrides_debt = _load_overrides_debt(overrides)

    attestations_dir = Path(args.attestations_dir).resolve()
    audit_bundles_dir = Path(args.audit_bundles_dir).resolve()
    reports_dir = Path(args.reports_dir).resolve()

    sprint0_rows = [r for r in plan_rows if str(r.get("Target Sprint") or "").strip() == "0"]
    audits = [
        _audit_task(
            r,
            tiers,
            overrides_evidence,
            overrides_debt,
            cutover,
            debt.get("items") or {},
            attestations_dir,
            audit_bundles_dir,
            args.run_id,
        )
        for r in sprint0_rows
    ]

    completed = [a for a in audits if a.status.strip().lower() == "completed"]
    by_class: dict[str, int] = {}
    for a in completed:
        by_class[a.classification] = by_class.get(a.classification, 0) + 1

    review_items_sorted = sorted([a for a in completed if a.reasons], key=lambda x: x.task_id)

    sprint0_audit_md = reports_dir / "sprint0-audit.md"
    review_queue_json = reports_dir / "review-queue.json"
    review_queue_md = reports_dir / "review-queue.md"

    md_lines = []
    md_lines.append("# Sprint 0 Audit")
    md_lines.append("")
    md_lines.append(f"- Generated: `{_utc_now()}`")
    md_lines.append(f"- Cutover: `{cutover.get('cutover_sha') or cutover.get('cutover_time') or 'unset'}`")
    md_lines.append(f"- Linked run-id: `{args.run_id or ''}`")
    md_lines.append("")
    md_lines.append("## Completed Summary")
    md_lines.append("")
    for k in sorted(by_class.keys()):
        md_lines.append(f"- {k}: {by_class[k]}")
    md_lines.append("")
    md_lines.append("## Completed Tasks")
    md_lines.append("")
    md_lines.append("| Task | Tier | Class | Post-cutover | Reasons |")
    md_lines.append("|------|------|-------|-------------|---------|")
    for a in sorted(completed, key=lambda x: x.task_id):
        md_lines.append(
            f"| `{a.task_id}` | {a.tier or ''} | {a.classification} | {a.is_post_cutover} | {', '.join(a.reasons)} |"
        )
    md_lines.append("")
    _write_text(sprint0_audit_md, "\n".join(md_lines) + "\n")

    review_data = {
        "generated_at": _utc_now(),
        "run_id": args.run_id,
        "items": [
            {
                "task_id": a.task_id,
                "tier": a.tier,
                "status": a.status,
                "classification": a.classification,
                "post_cutover": a.is_post_cutover,
                "inferred_commit_sha": a.inferred_commit_sha,
                "reasons": a.reasons,
                "missing_evidence": a.evidence_missing,
                "attestation_missing": a.attestation_missing,
                "attestation_invalid": a.attestation_invalid,
                "attestation_errors": a.attestation_errors,
                "audit_bundle_missing": a.audit_bundle_missing,
                "tier1_pass": a.tier1_pass,
                "debt_ids": a.debt_ids,
            }
            for a in review_items_sorted
        ],
    }
    _write_json(review_queue_json, review_data)

    rq_lines = []
    rq_lines.append("# Review Queue (Sprint 0)")
    rq_lines.append("")
    rq_lines.append(f"- Generated: `{review_data['generated_at']}`")
    rq_lines.append(f"- Items: `{len(review_items_sorted)}`")
    rq_lines.append("")
    for a in review_items_sorted:
        rq_lines.append(f"- `{a.task_id}`: {', '.join(a.reasons)}")
        if a.evidence_missing:
            rq_lines.append(
                f"  - missing evidence: {', '.join(a.evidence_missing[:5])}"
                + (" …" if len(a.evidence_missing) > 5 else "")
            )
    rq_lines.append("")
    _write_text(review_queue_md, "\n".join(rq_lines) + "\n")

    _render_debt_ledger(
        debt.get("raw") or {},
        REPO_ROOT / "artifacts" / "debt-ledger.md",
        REPO_ROOT / "artifacts" / "debt-ledger.jsonl",
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
