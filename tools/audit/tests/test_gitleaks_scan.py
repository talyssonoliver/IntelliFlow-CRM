"""
Tests for tools/audit/gitleaks_scan.py.

The default mode delegates to the shared secret-scan kit (.gitleaks/scan.sh
tree); explicit passthrough arguments still go to the gitleaks binary with the
repo config appended.
"""
from __future__ import annotations

import os
import sys
from types import SimpleNamespace

import gitleaks_scan


def _run_main(monkeypatch, argv, calls, returncode=0):
    monkeypatch.setattr(sys, "argv", ["gitleaks_scan.py", *argv])
    monkeypatch.setattr(
        gitleaks_scan, "_resolve_gitleaks_path", lambda version: "/opt/bin/gitleaks"
    )

    def fake_run(cmd, **kwargs):
        calls.append((cmd, kwargs))
        return SimpleNamespace(returncode=returncode)

    monkeypatch.setattr(gitleaks_scan.subprocess, "run", fake_run)
    return gitleaks_scan.main()


def test_default_mode_runs_the_kit_tree_scan(monkeypatch):
    calls: list = []
    code = _run_main(monkeypatch, [], calls)
    assert code == 0
    cmd, kwargs = calls[0]
    assert cmd == ["sh", ".gitleaks/scan.sh", "tree"]
    # the resolved binary directory is first on PATH so scan.sh finds it
    assert "bin" in kwargs["env"]["PATH"].split(os.pathsep)[0]


def test_default_mode_propagates_a_failing_scan(monkeypatch):
    calls: list = []
    assert _run_main(monkeypatch, [], calls, returncode=1) == 1


def test_passthrough_args_go_to_the_binary_with_the_repo_config(monkeypatch):
    calls: list = []
    code = _run_main(monkeypatch, ["--", "detect", "--source", "."], calls)
    assert code == 0
    cmd, _ = calls[0]
    assert cmd[0] == "/opt/bin/gitleaks"
    assert cmd[1:4] == ["detect", "--source", "."]
    assert "--config" in cmd
