#!/usr/bin/env bash
# =============================================================================
# Vercel "Ignored Build Step" — controls WHEN Vercel spends build minutes.
# Wired via vercel.json `ignoreCommand`.
#
# Vercel exit-code contract (counter-intuitive):
#   exit 0  -> SKIP the build (no minutes spent)        [git diff found nothing]
#   exit 1  -> PROCEED with the build                    [git diff found changes]
#
# CI-Audit P0 (2026-06-04): Vercel was auto-building a PREVIEW on every branch
# push, in parallel with — and usually BEFORE — CI Pipeline went green. That
# burned build minutes on commits that hadn't passed tests and shipped broken
# previews (one #247 preview landed in ERROR state). This gate stops that:
#
#   * PRODUCTION (main, post-merge = already green via branch protection):
#       build, but skip doc-only change sets.
#   * PREVIEW: never auto-build here. The CI-gated workflow
#       `.github/workflows/deploy-preview.yml` (trigger: workflow_run on
#       `CI Pipeline` success) deploys the preview via the Vercel CLI AFTER
#       CI is green. Suppressing the auto-build here removes every pre-green
#       preview build.
#
# Reversible: delete this file + restore the inline `git diff` ignoreCommand.
# See docs/operations/ci-retrospective-dora-2026-06-04.md and ADR-062.
# =============================================================================
set -uo pipefail

# Run from the repo root regardless of Vercel's configured Root Directory.
# This project's Root Directory is apps/web, so a cwd-relative path/pathspec
# would miss; git walks up to the worktree root from anywhere in the tree.
cd "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || true

ENVIRONMENT="${VERCEL_ENV:-preview}"

# Doc-only short-circuit (all environments): if the only changes since the
# previous commit are markdown / docs / CI / artifacts, skip the build. This
# preserves the behaviour of the previous inline `ignoreCommand`.
#   `git diff --quiet` exits 0 when there is NO diff for the given pathspec.
if git diff --quiet "HEAD^" "HEAD" -- . \
    ':(exclude)*.md' \
    ':(exclude)docs/**' \
    ':(exclude).github/**' \
    ':(exclude)artifacts/**' 2>/dev/null; then
  echo "ignore-build: doc/CI-only change set since HEAD^ — SKIP (exit 0)."
  exit 0
fi

if [ "$ENVIRONMENT" = "production" ]; then
  echo "ignore-build: production build with code changes — BUILD (exit 1)."
  exit 1
fi

# Preview environment: do NOT auto-build. deploy-preview.yml builds this commit
# via the Vercel CLI only after `CI Pipeline` concludes success for the SHA.
echo "ignore-build: preview auto-build suppressed — deploy-preview.yml deploys this after CI is green (exit 0)."
exit 0
