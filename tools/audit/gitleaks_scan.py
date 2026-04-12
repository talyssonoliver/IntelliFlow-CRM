#!/usr/bin/env python3
"""
Deterministic gitleaks runner for the system-audit framework.

The audit matrix expects `gitleaks` to be available. On developer machines (and
some CI runners) that binary may not be installed globally, so this script:

1) Uses `gitleaks` from PATH if present.
2) Otherwise downloads a pinned release from GitHub and caches it under `.turbo/`.

Exit codes are propagated from gitleaks (0 = pass, 1 = leaks found, >1 = error).
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VERSION = "8.24.0"


def _is_windows() -> bool:
    return os.name == "nt"


def _platform_id() -> str:
    if sys.platform.startswith("win"):
        return "windows"
    if sys.platform.startswith("darwin"):
        return "darwin"
    return "linux"


def _arch_variants() -> list[str]:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return ["x64", "x86_64", "amd64"]
    if machine in {"arm64", "aarch64"}:
        return ["arm64", "aarch64"]
    return [machine]


def _binary_name() -> str:
    return "gitleaks.exe" if _is_windows() else "gitleaks"


def _cache_dir(version: str) -> Path:
    platform_id = _platform_id()
    arch = _arch_variants()[0]
    return REPO_ROOT / ".turbo" / "tools" / "gitleaks" / version / f"{platform_id}-{arch}"


def _download_bytes(url: str) -> bytes:
    req = Request(url, headers={"User-Agent": "intelliflow-audit/1.0"})
    with urlopen(req, timeout=60) as resp:  # nosec - fixed URL to GitHub releases
        return resp.read()


def _extract_binary(archive_path: Path, dest_path: Path) -> None:
    name_candidates = {_binary_name(), "gitleaks", "gitleaks.exe"}

    if archive_path.name.endswith(".zip"):
        with zipfile.ZipFile(archive_path) as zf:
            member = next(
                (m for m in zf.infolist() if Path(m.filename).name in name_candidates and not m.is_dir()),
                None,
            )
            if member is None:
                raise RuntimeError("gitleaks binary not found in zip archive")
            with zf.open(member, "r") as src, open(dest_path, "wb") as dst:
                shutil.copyfileobj(src, dst)
        return

    if archive_path.name.endswith(".tar.gz"):
        with tarfile.open(archive_path, mode="r:gz") as tf:
            member = next(
                (m for m in tf.getmembers() if Path(m.name).name in name_candidates and m.isfile()),
                None,
            )
            if member is None:
                raise RuntimeError("gitleaks binary not found in tar.gz archive")
            extracted = tf.extractfile(member)
            if extracted is None:
                raise RuntimeError("failed to extract gitleaks binary from tar.gz archive")
            with extracted, open(dest_path, "wb") as dst:
                shutil.copyfileobj(extracted, dst)
        return

    raise RuntimeError(f"unsupported archive format: {archive_path.name}")


def _ensure_executable(path: Path) -> None:
    if _is_windows():
        return
    mode = path.stat().st_mode
    path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _download_gitleaks(version: str) -> Path:
    cache_dir = _cache_dir(version)
    cache_dir.mkdir(parents=True, exist_ok=True)

    binary_path = cache_dir / _binary_name()
    if binary_path.exists():
        return binary_path

    platform_id = _platform_id()
    exts = ["zip"] if platform_id == "windows" else ["tar.gz", "zip"]

    last_error: Exception | None = None
    for arch in _arch_variants():
        for ext in exts:
            asset = f"gitleaks_{version}_{platform_id}_{arch}.{ext}"
            url = f"https://github.com/gitleaks/gitleaks/releases/download/v{version}/{asset}"
            try:
                print(f"[gitleaks] downloading {url}")
                data = _download_bytes(url)
            except (HTTPError, URLError, TimeoutError) as err:
                last_error = err
                continue

            with tempfile.NamedTemporaryFile(delete=False, dir=str(cache_dir), prefix="gitleaks-", suffix=f".{ext}") as f:
                f.write(data)
                archive_path = Path(f.name)

            try:
                _extract_binary(archive_path, binary_path)
                _ensure_executable(binary_path)
                return binary_path
            finally:
                try:
                    archive_path.unlink(missing_ok=True)
                except Exception:
                    pass

    if last_error is not None:
        raise RuntimeError(f"failed to download gitleaks v{version}: {last_error}") from last_error
    raise RuntimeError(f"failed to download gitleaks v{version}: no compatible asset found")


def _resolve_gitleaks_path(version: str) -> str:
    from_path = shutil.which("gitleaks")
    if from_path:
        return from_path
    return str(_download_gitleaks(version))


def main() -> int:
    parser = argparse.ArgumentParser(description="Run gitleaks with a cached binary.")
    parser.add_argument(
        "--version",
        default=os.environ.get("GITLEAKS_VERSION", DEFAULT_VERSION),
        help="Gitleaks version to download if not on PATH (default: %(default)s).",
    )
    parser.add_argument(
        "gitleaks_args",
        nargs=argparse.REMAINDER,
        help="Arguments passed through to gitleaks (default: detect --source . --redact).",
    )
    args = parser.parse_args()

    gitleaks_args = [a for a in args.gitleaks_args if a != "--"]
    if not gitleaks_args:
        gitleaks_args = ["detect", "--source", ".", "--redact"]

    config_path = REPO_ROOT / ".gitleaks.toml"
    if config_path.exists() and "--config" not in gitleaks_args:
        gitleaks_args.extend(["--config", str(config_path)])

    gitleaks_bin = _resolve_gitleaks_path(str(args.version))
    print(f"[gitleaks] using {gitleaks_bin}")
    print(f"[gitleaks] args: {' '.join(gitleaks_args)}")

    proc = subprocess.run([gitleaks_bin, *gitleaks_args], cwd=str(REPO_ROOT), shell=False)
    return int(proc.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
