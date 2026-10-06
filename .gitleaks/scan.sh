#!/usr/bin/env sh
# Secret scan shared by the pre-commit hook and CI. Canonical copy:
# C:/Users/talys/ops/secret-scan/scan.sh (identical in every repo).
#
#   .gitleaks/scan.sh staged            scan the staged diff (pre-commit)
#   .gitleaks/scan.sh range BASE HEAD   scan commits BASE..HEAD (CI, PR diff)
#   .gitleaks/scan.sh tree              scan every tracked file at HEAD
#
# Prints only file:line and the rule id, never the matched value. Blocks on
# any finding. Inline `gitleaks:allow` comments and .gitleaksignore files are
# ignored: the only allowlist is .gitleaks.toml, one file per entry, each
# with a reason. Fails closed when gitleaks is missing.
set -u

root=$(git rev-parse --show-toplevel) || exit 2
cd "$root" || exit 2

if ! command -v gitleaks >/dev/null 2>&1; then
  for d in "${LOCALAPPDATA:-}/Microsoft/WinGet/Links" "$HOME/AppData/Local/Microsoft/WinGet/Links" "$HOME/.local/bin"; do
    if [ -x "$d/gitleaks" ] || [ -x "$d/gitleaks.exe" ]; then PATH="$d:$PATH"; break; fi
  done
fi
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "secret-scan: gitleaks is not installed, so this is blocked." >&2
  echo "  Windows: winget install Gitleaks.Gitleaks   macOS: brew install gitleaks" >&2
  exit 1
fi

report=$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/secret-scan.$$")
trap 'rm -f "$report"' EXIT

set -- "${1:-staged}" "${2:-}" "${3:-}"
conf="$root/.gitleaks.toml"
tmpl="$root/.gitleaks/report.tmpl"
ignore="$root/.gitleaks"
case "$1" in
  staged) mode_args="--pre-commit --staged" ;;
  tree)
    # Tracked files only, exactly as committed at HEAD. The [extend] path in
    # .gitleaks.toml is relative to the cwd, so run from a copy that has it.
    snap=$(mktemp -d 2>/dev/null || echo "${TMPDIR:-/tmp}/secret-scan-tree.$$")
    mkdir -p "$snap"
    trap 'rm -f "$report"; rm -rf "$snap"' EXIT
    git archive HEAD | tar -x -C "$snap" || exit 2
    { cp .gitleaks.toml "$snap/.gitleaks.toml" && mkdir -p "$snap/.gitleaks" && cp .gitleaks/* "$snap/.gitleaks/"; } || exit 2
    cd "$snap" || exit 2
    conf=".gitleaks.toml"; tmpl=".gitleaks/report.tmpl"; ignore=".gitleaks"
    mode_args="" ;;
  range)
    if [ -z "$2" ] || [ -z "$3" ]; then echo "usage: scan.sh range BASE HEAD" >&2; exit 2; fi
    mode_args="--log-opts=$2..$3" ;;
  *) echo "usage: scan.sh staged | scan.sh range BASE HEAD | scan.sh tree" >&2; exit 2 ;;
esac

if [ "$1" = tree ]; then sub=dir; else sub=git; fi
# shellcheck disable=SC2086
gitleaks $sub $mode_args \
  --config "$conf" \
  --gitleaks-ignore-path "$ignore" \
  --ignore-gitleaks-allow \
  --redact \
  --no-banner \
  --log-level error \
  --report-format template \
  --report-template "$tmpl" \
  --report-path "$report" \
  .
status=$?

if [ "$status" -eq 0 ]; then
  exit 0
fi
if [ -s "$report" ] && grep -q '\[' "$report"; then
  echo "secret-scan: credential-shaped string(s) found. Fake values count too." >&2
  cat "$report" >&2
  echo "  Fix: build test values at runtime from parts ('post' + 'gres://'), use" >&2
  echo "  *.example.invalid hosts, or read real values from the environment." >&2
  echo "  A genuine exception needs a per-file [[allowlists]] entry with a reason" >&2
  echo "  in .gitleaks.toml." >&2
else
  echo "secret-scan: gitleaks failed (exit $status) without findings; blocking." >&2
fi
exit 1
