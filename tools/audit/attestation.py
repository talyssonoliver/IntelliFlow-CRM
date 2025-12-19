#!/usr/bin/env python
from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ATTESTATIONS_DIR = REPO_ROOT / "artifacts" / "attestations"
DEFAULT_AUDIT_BUNDLES_DIR = REPO_ROOT / "artifacts" / "reports" / "system-audit"
DEFAULT_CUTOVER_PATH = REPO_ROOT / "audit-cutover.yml"

SCHEMA_VERSION = "1.0.0"

_TASK_ID_RE = re.compile(r"^[A-Z0-9]+(?:-[A-Z0-9]+)+$")
_RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]+$")
_SHA_RE = re.compile(r"^[a-fA-F0-9]{7,40}$")
_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _safe_load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _safe_load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_file(path: Path) -> str:
    return _sha256_bytes(path.read_bytes())


def _as_repo_rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
    except Exception:
        return str(path).replace("\\", "/")


def _compute_tier1_required_passed(summary: dict[str, Any]) -> bool | None:
    result = summary.get("result")
    if isinstance(result, dict):
        failed = result.get("tier1_required_failed")
        if isinstance(failed, int):
            return failed == 0

    tools = summary.get("tools")
    if not isinstance(tools, list):
        return None

    tier1_required = [
        t
        for t in tools
        if isinstance(t, dict)
        and int(t.get("tier", 0)) == 1
        and bool(t.get("required"))
        and t.get("enabled", True) is not False
    ]
    if not tier1_required:
        return None
    return all(t.get("status") == "pass" for t in tier1_required)


@dataclass(frozen=True)
class AttestationValidation:
    ok: bool
    errors: list[str]
    summary: dict[str, Any] | None = None


def validate_attestation_file(
    path: Path,
    audit_bundles_dir: Path = DEFAULT_AUDIT_BUNDLES_DIR,
) -> AttestationValidation:
    errors: list[str] = []

    try:
        att = _safe_load_json(path)
    except Exception as e:
        return AttestationValidation(ok=False, errors=[f"invalid JSON: {e}"], summary=None)

    if not isinstance(att, dict):
        return AttestationValidation(ok=False, errors=["root must be a JSON object"], summary=None)

    schema_version = str(att.get("schema_version") or "").strip()
    if schema_version != SCHEMA_VERSION:
        errors.append(f"schema_version must be '{SCHEMA_VERSION}'")

    task_id = str(att.get("task_id") or "").strip()
    if not task_id:
        errors.append("task_id is required")
    elif not _TASK_ID_RE.match(task_id):
        errors.append("task_id must match ^[A-Z0-9]+(?:-[A-Z0-9]+)+$")

    if task_id and path.stem != task_id:
        errors.append(f"filename must match task_id (expected {task_id}.json)")

    attested_by = str(att.get("attested_by") or "").strip()
    if not attested_by:
        errors.append("attested_by is required")

    generated_at = str(att.get("generated_at") or "").strip()
    if not generated_at:
        errors.append("generated_at is required")
    else:
        try:
            datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
        except Exception:
            errors.append("generated_at must be ISO-8601 date-time")

    audit = att.get("audit")
    if not isinstance(audit, dict):
        errors.append("audit must be an object")
        return AttestationValidation(ok=False, errors=errors, summary=None)

    run_id = str(audit.get("run_id") or "").strip()
    if not run_id:
        errors.append("audit.run_id is required")
    elif not _RUN_ID_RE.match(run_id):
        errors.append("audit.run_id contains invalid characters")

    summary_json = str(audit.get("summary_json") or "").strip()
    if not summary_json:
        errors.append("audit.summary_json is required")

    summary_sha256 = str(audit.get("summary_sha256") or "").strip()
    if not summary_sha256:
        errors.append("audit.summary_sha256 is required")
    elif not _SHA256_RE.match(summary_sha256):
        errors.append("audit.summary_sha256 must be a lowercase hex sha256")

    commit_sha = str(audit.get("commit_sha") or "").strip()
    if not commit_sha:
        errors.append("audit.commit_sha is required")
    elif not _SHA_RE.match(commit_sha):
        errors.append("audit.commit_sha must be a git sha (7-40 hex)")

    matrix_sha256 = str(audit.get("matrix_sha256") or "").strip()
    if not matrix_sha256:
        errors.append("audit.matrix_sha256 is required")
    elif not _SHA256_RE.match(matrix_sha256):
        errors.append("audit.matrix_sha256 must be a lowercase hex sha256")

    overall_status = str(audit.get("overall_status") or "").strip()
    if overall_status not in {"pass", "fail", "warn"}:
        errors.append("audit.overall_status must be one of: pass, fail, warn")

    tier1_required_passed = audit.get("tier1_required_passed")
    if not isinstance(tier1_required_passed, bool):
        errors.append("audit.tier1_required_passed must be a boolean")

    if run_id:
        actual_summary_path = audit_bundles_dir / run_id / "summary.json"
        if not actual_summary_path.exists():
            errors.append(f"missing audit bundle summary: {_as_repo_rel(actual_summary_path)}")
            return AttestationValidation(ok=False, errors=errors, summary=None)

        actual_sha = _sha256_file(actual_summary_path)
        if summary_sha256 and actual_sha != summary_sha256:
            errors.append("audit.summary_sha256 does not match summary.json")

        try:
            summary = _safe_load_json(actual_summary_path)
        except Exception as e:
            errors.append(f"unable to parse audit summary.json: {e}")
            return AttestationValidation(ok=False, errors=errors, summary=None)

        if not isinstance(summary, dict):
            errors.append("audit summary.json root must be an object")
            return AttestationValidation(ok=False, errors=errors, summary=None)

        actual_commit = str(summary.get("commit_sha") or "").strip()
        if commit_sha and actual_commit and actual_commit != commit_sha:
            errors.append(f"audit.commit_sha mismatch (expected {actual_commit})")

        actual_matrix = str(summary.get("matrix_sha256") or "").strip()
        if matrix_sha256 and actual_matrix and actual_matrix != matrix_sha256:
            errors.append("audit.matrix_sha256 mismatch with bundle summary.json")

        actual_overall = str((summary.get("result") or {}).get("overall_status") or "").strip()
        if overall_status and actual_overall and actual_overall != overall_status:
            errors.append("audit.overall_status mismatch with bundle summary.json")

        computed_tier1 = _compute_tier1_required_passed(summary)
        if isinstance(tier1_required_passed, bool) and computed_tier1 is not None:
            if computed_tier1 != tier1_required_passed:
                errors.append("audit.tier1_required_passed mismatch with bundle summary.json")

        if computed_tier1 is False:
            errors.append("tier1 required tools did not pass for this run-id")

        return AttestationValidation(ok=len(errors) == 0, errors=errors, summary=summary)

    return AttestationValidation(ok=len(errors) == 0, errors=errors, summary=None)


def generate_attestation(
    task_id: str,
    run_id: str,
    attested_by: str,
    notes: str | None,
    attestations_dir: Path = DEFAULT_ATTESTATIONS_DIR,
    audit_bundles_dir: Path = DEFAULT_AUDIT_BUNDLES_DIR,
    cutover_path: Path = DEFAULT_CUTOVER_PATH,
    force: bool = False,
) -> Path:
    if not _TASK_ID_RE.match(task_id):
        raise ValueError("task_id must match ^[A-Z0-9]+(?:-[A-Z0-9]+)+$")
    if not _RUN_ID_RE.match(run_id):
        raise ValueError("run_id contains invalid characters")
    if not attested_by.strip():
        raise ValueError("attested_by is required")

    summary_path = audit_bundles_dir / run_id / "summary.json"
    if not summary_path.exists():
        raise FileNotFoundError(f"audit summary not found: {_as_repo_rel(summary_path)}")

    summary = _safe_load_json(summary_path)
    if not isinstance(summary, dict):
        raise ValueError("audit summary.json root must be an object")

    commit_sha = str(summary.get("commit_sha") or "").strip()
    matrix_sha256 = str(summary.get("matrix_sha256") or "").strip()
    overall_status = str((summary.get("result") or {}).get("overall_status") or "").strip()
    tier1_passed = _compute_tier1_required_passed(summary)

    if not commit_sha or not _SHA_RE.match(commit_sha):
        raise ValueError("audit summary.json missing commit_sha")
    if not matrix_sha256 or not _SHA256_RE.match(matrix_sha256):
        raise ValueError("audit summary.json missing matrix_sha256")
    if overall_status not in {"pass", "fail", "warn"}:
        raise ValueError("audit summary.json missing overall_status")
    if tier1_passed is False:
        raise ValueError("cannot generate attestation: tier1 required tools did not pass")

    bundle_dir = audit_bundles_dir / run_id
    summary_rel = _as_repo_rel(summary_path)
    bundle_rel = _as_repo_rel(bundle_dir)

    cutover: dict[str, Any] | None = None
    if cutover_path.exists():
        data = _safe_load_yaml(cutover_path)
        if isinstance(data, dict):
            cutover = {
                "policy_version": data.get("policy_version"),
                "cutover_sha": data.get("cutover_sha"),
                "cutover_time": data.get("cutover_time"),
            }

    out_path = attestations_dir / f"{task_id}.json"
    if out_path.exists() and not force:
        raise FileExistsError(f"attestation already exists: {_as_repo_rel(out_path)} (use --force)")

    attestation_obj: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "task_id": task_id,
        "generated_at": _utc_now(),
        "attested_by": attested_by.strip(),
        "audit": {
            "run_id": run_id,
            "bundle_dir": bundle_rel,
            "summary_json": summary_rel,
            "summary_sha256": _sha256_file(summary_path),
            "commit_sha": commit_sha,
            "matrix_sha256": matrix_sha256,
            "overall_status": overall_status,
            "tier1_required_passed": True if tier1_passed is None else bool(tier1_passed),
        },
    }
    if cutover:
        attestation_obj["cutover"] = cutover
    if notes and notes.strip():
        attestation_obj["notes"] = notes.strip()

    _write_json(out_path, attestation_obj)
    return out_path


def _cmd_generate(args: argparse.Namespace) -> int:
    try:
        out_path = generate_attestation(
            task_id=args.task_id,
            run_id=args.run_id,
            attested_by=args.attested_by,
            notes=args.notes,
            attestations_dir=Path(args.attestations_dir).resolve(),
            audit_bundles_dir=Path(args.audit_bundles_dir).resolve(),
            cutover_path=Path(args.cutover_path).resolve(),
            force=bool(args.force),
        )
    except Exception as e:
        print(f"[attestation] ERROR: {e}")
        return 1

    print(f"[attestation] wrote: {_as_repo_rel(out_path)}")
    v = validate_attestation_file(out_path, audit_bundles_dir=Path(args.audit_bundles_dir).resolve())
    if not v.ok:
        print("[attestation] validation failed after generation:")
        for err in v.errors:
            print(f"  - {err}")
        return 1
    return 0


def _cmd_validate(args: argparse.Namespace) -> int:
    audit_bundles_dir = Path(args.audit_bundles_dir).resolve()
    attestations_dir = Path(args.attestations_dir).resolve()

    paths: list[Path] = []
    if args.all:
        if not attestations_dir.exists():
            print(f"[attestation] attestations dir not found: {_as_repo_rel(attestations_dir)}")
            return 1
        paths = sorted(attestations_dir.glob("*.json"))
    else:
        paths = [Path(args.path).resolve()] if args.path else [attestations_dir / f"{args.task_id}.json"]

    failed = 0
    for p in paths:
        v = validate_attestation_file(p, audit_bundles_dir=audit_bundles_dir)
        if v.ok:
            print(f"[attestation] OK: {_as_repo_rel(p)}")
        else:
            failed += 1
            print(f"[attestation] FAIL: {_as_repo_rel(p)}")
            for err in v.errors:
                print(f"  - {err}")

    return 0 if failed == 0 else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate and validate per-task attestations.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_gen = sub.add_parser("generate", help="Generate artifacts/attestations/<TASK>.json from a run-id bundle.")
    p_gen.add_argument("--task-id", required=True, help="Task ID (e.g., IFC-160)")
    p_gen.add_argument("--run-id", required=True, help="Audit run-id (e.g., local-smoke)")
    p_gen.add_argument("--attested-by", required=True, help="Human attestor (name/role)")
    p_gen.add_argument("--notes", default=None, help="Optional notes")
    p_gen.add_argument("--attestations-dir", default=str(DEFAULT_ATTESTATIONS_DIR), help="Attestations directory")
    p_gen.add_argument("--audit-bundles-dir", default=str(DEFAULT_AUDIT_BUNDLES_DIR), help="Audit bundles directory")
    p_gen.add_argument("--cutover-path", default=str(DEFAULT_CUTOVER_PATH), help="audit-cutover.yml path")
    p_gen.add_argument("--force", action="store_true", help="Overwrite if exists")
    p_gen.set_defaults(func=_cmd_generate)

    p_val = sub.add_parser("validate", help="Validate attestations (schema + audit bundle linkage).")
    p_val.add_argument("--task-id", default=None, help="Task ID (default: required unless --all or --path)")
    p_val.add_argument("--path", default=None, help="Explicit attestation JSON path")
    p_val.add_argument("--all", action="store_true", help="Validate all attestations in the directory")
    p_val.add_argument("--attestations-dir", default=str(DEFAULT_ATTESTATIONS_DIR), help="Attestations directory")
    p_val.add_argument("--audit-bundles-dir", default=str(DEFAULT_AUDIT_BUNDLES_DIR), help="Audit bundles directory")
    p_val.set_defaults(func=_cmd_validate)

    args = parser.parse_args(argv)
    if args.cmd == "validate" and not args.all and not args.path and not args.task_id:
        parser.error("validate requires --task-id, --path, or --all")
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

