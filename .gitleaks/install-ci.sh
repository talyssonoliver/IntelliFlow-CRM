#!/usr/bin/env bash
# Installs the pinned gitleaks for CI and checks its SHA-256. Canonical copy:
# C:/Users/talys/ops/secret-scan/install-ci.sh (identical in every repo).
# Reuses an existing gitleaks of the same version (self-hosted runners).
set -euo pipefail
VERSION=8.30.1
SHA_LINUX_X64=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb
SHA_WINDOWS_X64=d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e

if command -v gitleaks >/dev/null 2>&1 && gitleaks version 2>/dev/null | grep -qx "$VERSION"; then
  echo "gitleaks $VERSION already installed"
  exit 0
fi

dest="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/gitleaks-$VERSION-$$"
mkdir -p "$dest"
base="https://github.com/gitleaks/gitleaks/releases/download/v$VERSION"
case "$(uname -s)" in
  Linux*)
    asset="gitleaks_${VERSION}_linux_x64.tar.gz"; want="$SHA_LINUX_X64" ;;
  MINGW*|MSYS*|CYGWIN*)
    asset="gitleaks_${VERSION}_windows_x64.zip"; want="$SHA_WINDOWS_X64" ;;
  *) echo "install-ci: unsupported runner OS $(uname -s)" >&2; exit 1 ;;
esac

curl -fsSL --retry 3 -o "$dest/$asset" "$base/$asset"
got=$(sha256sum "$dest/$asset" | cut -d' ' -f1)
if [ "$got" != "$want" ]; then
  echo "install-ci: checksum mismatch for $asset" >&2
  exit 1
fi
case "$asset" in
  *.tar.gz) tar -xzf "$dest/$asset" -C "$dest" gitleaks ;;
  *.zip) unzip -q -o "$dest/$asset" gitleaks.exe -d "$dest" ;;
esac
if [ -n "${GITHUB_PATH:-}" ]; then echo "$dest" >> "$GITHUB_PATH"; fi
"$dest/gitleaks" version
