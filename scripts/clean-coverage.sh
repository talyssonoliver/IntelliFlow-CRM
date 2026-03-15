#!/usr/bin/env bash
# Clean all generated coverage data (gitignored files only).
# Safe to run anytime — preserves the 3 git-tracked files in artifacts/coverage/.
#
# Usage: bash scripts/clean-coverage.sh [--dry-run]

set -euo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

dirs_to_remove=(
  "$REPO_ROOT/artifacts/coverage-vitest"
  "$REPO_ROOT/artifacts/coverage-parts"
  "$REPO_ROOT/coverage"
)

# HTML/asset files inside artifacts/coverage/ (gitignored, not the 3 tracked data files)
coverage_html_globs=(
  "$REPO_ROOT/artifacts/coverage/**/*.html"
  "$REPO_ROOT/artifacts/coverage/**/*.css"
  "$REPO_ROOT/artifacts/coverage/**/*.js"
  "$REPO_ROOT/artifacts/coverage/**/*.png"
  "$REPO_ROOT/artifacts/coverage/lcov-report"
  "$REPO_ROOT/artifacts/coverage/components"
  "$REPO_ROOT/artifacts/coverage/hooks"
)

total_freed=0

for dir in "${dirs_to_remove[@]}"; do
  if [[ -d "$dir" ]]; then
    size=$(du -sm "$dir" 2>/dev/null | cut -f1)
    total_freed=$((total_freed + size))
    if $DRY_RUN; then
      echo "[DRY RUN] Would remove: $dir ($size MB)"
    else
      rm -rf "$dir"
      echo "Removed: $dir ($size MB)"
    fi
  fi
done

for glob in "${coverage_html_globs[@]}"; do
  # shellcheck disable=SC2086
  for item in $glob; do
    if [[ -e "$item" ]]; then
      if $DRY_RUN; then
        echo "[DRY RUN] Would remove: $item"
      else
        rm -rf "$item"
        echo "Removed: $item"
      fi
    fi
  done
done

echo ""
if $DRY_RUN; then
  echo "Dry run complete. Would free ~${total_freed} MB."
  echo "Run without --dry-run to execute."
else
  echo "Coverage cleanup complete. Freed ~${total_freed} MB."
  echo "Preserved: artifacts/coverage/coverage-final.json, coverage-summary.json, lcov.info"
fi
