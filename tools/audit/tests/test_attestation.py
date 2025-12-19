from __future__ import annotations

import json
from pathlib import Path

import attestation


def _write_summary(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def test_generate_and_validate_attestation(tmp_path: Path) -> None:
    bundles = tmp_path / "bundles"
    run_id = "local-smoke"
    summary_path = bundles / run_id / "summary.json"
    _write_summary(
        summary_path,
        {
            "commit_sha": "15c538ed6294b64e6875e14c3efd318c661e2bb7",
            "matrix_sha256": "2dee9886863e0e45fbd288f16f012349818f6f1b37f647e9e2a36bd070b887b5",
            "result": {"overall_status": "pass", "tier1_required_failed": 0},
            "tools": [],
        },
    )

    out_dir = tmp_path / "attestations"
    out = attestation.generate_attestation(
        task_id="IFC-160",
        run_id=run_id,
        attested_by="Tech Lead",
        notes="ok",
        attestations_dir=out_dir,
        audit_bundles_dir=bundles,
        cutover_path=tmp_path / "missing-cutover.yml",
    )

    v = attestation.validate_attestation_file(out, audit_bundles_dir=bundles)
    assert v.ok is True


def test_validation_fails_when_audit_summary_changes(tmp_path: Path) -> None:
    bundles = tmp_path / "bundles"
    run_id = "local-smoke"
    summary_path = bundles / run_id / "summary.json"
    _write_summary(
        summary_path,
        {
            "commit_sha": "15c538ed6294b64e6875e14c3efd318c661e2bb7",
            "matrix_sha256": "2dee9886863e0e45fbd288f16f012349818f6f1b37f647e9e2a36bd070b887b5",
            "result": {"overall_status": "pass", "tier1_required_failed": 0},
        },
    )

    out_dir = tmp_path / "attestations"
    out = attestation.generate_attestation(
        task_id="IFC-160",
        run_id=run_id,
        attested_by="Tech Lead",
        notes=None,
        attestations_dir=out_dir,
        audit_bundles_dir=bundles,
        cutover_path=tmp_path / "missing-cutover.yml",
    )

    # mutate summary.json after attestation was generated
    _write_summary(
        summary_path,
        {
            "commit_sha": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
            "matrix_sha256": "2dee9886863e0e45fbd288f16f012349818f6f1b37f647e9e2a36bd070b887b5",
            "result": {"overall_status": "pass", "tier1_required_failed": 0},
        },
    )

    v = attestation.validate_attestation_file(out, audit_bundles_dir=bundles)
    assert v.ok is False
    assert any("summary_sha256" in e for e in v.errors)


def test_generate_refuses_when_tier1_failed(tmp_path: Path) -> None:
    bundles = tmp_path / "bundles"
    run_id = "local-smoke"
    summary_path = bundles / run_id / "summary.json"
    _write_summary(
        summary_path,
        {
            "commit_sha": "15c538ed6294b64e6875e14c3efd318c661e2bb7",
            "matrix_sha256": "2dee9886863e0e45fbd288f16f012349818f6f1b37f647e9e2a36bd070b887b5",
            "result": {"overall_status": "fail", "tier1_required_failed": 1},
        },
    )

    out_dir = tmp_path / "attestations"
    try:
        attestation.generate_attestation(
            task_id="IFC-160",
            run_id=run_id,
            attested_by="Tech Lead",
            notes=None,
            attestations_dir=out_dir,
            audit_bundles_dir=bundles,
            cutover_path=tmp_path / "missing-cutover.yml",
        )
        assert False, "expected generate_attestation to raise"
    except ValueError as e:
        assert "tier1" in str(e).lower()

