from __future__ import annotations

from pathlib import Path
from typing import Any

import sprint0_audit


def test_post_cutover_completed_requires_attestation(monkeypatch: Any) -> None:
    row = {"Task ID": "A-001", "Status": "Completed", "Target Sprint": "0", "Artifacts To Track": ""}
    tiers = {"A-001": "A"}
    overrides_evidence: dict[str, list[str]] = {}
    overrides_debt: dict[str, dict[str, Any]] = {}
    cutover = {"cutover_sha": "deadbeef"}
    debt_items: dict[str, Any] = {}

    monkeypatch.setattr(sprint0_audit, "_infer_task_commit", lambda _task_id: ("feedface", 0))
    monkeypatch.setattr(sprint0_audit, "_task_is_post_cutover", lambda _sha, _ts, _cutover: True)
    monkeypatch.setattr(sprint0_audit, "_path_exists", lambda _p: True)

    a = sprint0_audit._audit_task(
        row,
        tiers,
        overrides_evidence,
        overrides_debt,
        cutover,
        debt_items,
        attestations_dir=Path("does-not-exist"),
        audit_bundles_dir=Path("does-not-exist"),
        run_id=None,
    )
    assert a.classification == "In Review"
    assert "MISSING_ATTESTATION" in a.reasons
    assert "TIER_A_MUST_REVIEW" in a.reasons


def test_post_cutover_completed_invalid_attestation(monkeypatch: Any, tmp_path: Path) -> None:
    row = {"Task ID": "A-001", "Status": "Completed", "Target Sprint": "0", "Artifacts To Track": ""}
    tiers = {"A-001": "A"}
    overrides_evidence: dict[str, list[str]] = {}
    overrides_debt: dict[str, dict[str, Any]] = {}
    cutover = {"cutover_sha": "deadbeef"}
    debt_items: dict[str, Any] = {}

    (tmp_path / "A-001.json").write_text("{}", encoding="utf-8")

    monkeypatch.setattr(sprint0_audit, "_infer_task_commit", lambda _task_id: ("feedface", 0))
    monkeypatch.setattr(sprint0_audit, "_task_is_post_cutover", lambda _sha, _ts, _cutover: True)
    monkeypatch.setattr(sprint0_audit, "_path_exists", lambda _p: True)

    monkeypatch.setattr(
        sprint0_audit.attestation,
        "validate_attestation_file",
        lambda _path, audit_bundles_dir: sprint0_audit.attestation.AttestationValidation(
            ok=False, errors=["invalid"], summary=None
        ),
    )

    a = sprint0_audit._audit_task(
        row,
        tiers,
        overrides_evidence,
        overrides_debt,
        cutover,
        debt_items,
        attestations_dir=tmp_path,
        audit_bundles_dir=Path("does-not-exist"),
        run_id=None,
    )
    assert a.classification == "In Review"
    assert "INVALID_ATTESTATION" in a.reasons
    assert "MISSING_ATTESTATION" not in a.reasons


def test_legacy_debt_accepted_requires_ledger_entry(monkeypatch: Any) -> None:
    row = {"Task ID": "A-001", "Status": "Completed", "Target Sprint": "0", "Artifacts To Track": ""}
    tiers = {"A-001": "B"}
    overrides_evidence: dict[str, list[str]] = {}
    overrides_debt = {"A-001": {"debt_allowed": "yes", "waiver_expiry": "2026-01-01"}}
    cutover = {"cutover_sha": "deadbeef"}
    debt_items = {"DEBT-123": {"origin_task": "A-001"}}

    monkeypatch.setattr(sprint0_audit, "_infer_task_commit", lambda _task_id: ("feedface", 0))
    monkeypatch.setattr(sprint0_audit, "_task_is_post_cutover", lambda _sha, _ts, _cutover: False)
    monkeypatch.setattr(sprint0_audit, "_path_exists", lambda _p: False)

    a = sprint0_audit._audit_task(
        row,
        tiers,
        overrides_evidence,
        overrides_debt,
        cutover,
        debt_items,
        attestations_dir=Path("does-not-exist"),
        audit_bundles_dir=Path("does-not-exist"),
        run_id=None,
    )
    assert a.classification == "Debt Accepted"
    assert "WAIVER_PRESENT" in a.reasons
