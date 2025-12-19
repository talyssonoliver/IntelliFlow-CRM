# IntelliFlow Audit System: Performance & Iteration Improvements

A standalone implementation brief + Codex CLI prompt for making the audit system
fast on PRs (affected-only) while staying deterministic and audit-safe.

---

## 1) Intent

The base system (cutover + tiers + evidence bundles) is defined in:

- `apps/project-tracker/docs/metrics/_global/audit_playbook.md`

This document covers **additive** performance and iteration improvements:

- affected-only execution for PRs
- safe caching
- resumable runs, retries, and limited parallelism
- tool version capture

---

## 2) In-repo entrypoints (this repo)

- Affected scope: `tools/audit/affected.py` -> `artifacts/reports/affected/`
- Tool versions: `tools/audit/tool_versions.py` ->
  `artifacts/reports/system-audit/<RUN_ID>/tool-versions.json`
- Runner: `tools/audit/run_audit.py` (`--mode`, `--scope`, `--resume`,
  `--concurrency`, per-tool `retries`)
- Docs: `docs/ops/audit-performance-and-iteration.md`
- CI (PR): `.github/workflows/system-audit.yml`
- CI (nightly): `.github/workflows/system-audit-nightly.yml`
- CI (integrity): `.github/workflows/system-audit-integrity.yml`

---

## 3) What is implemented

### 3.1 Modes and scopes

`tools/audit/run_audit.py` supports mode presets:

- `--mode pr`: Tier 1 + Tier 2, default scope `affected`
- `--mode main`: Tier 1 + Tier 2, default scope `full`
- `--mode nightly`: Tier 1 + Tier 2 + Tier 3, default scope `full`
- `--mode release`: Tier 1 + Tier 3, default scope `full`

You can override scope explicitly:

```bash
python tools/audit/run_audit.py --mode pr --scope full
python tools/audit/run_audit.py --tier 1 --scope affected
```

### 3.2 Affected routing (PR scope)

When `--scope affected`:

- Turbo tasks run with `--filter=...` for affected packages (+ dependents).
- ESLint runs against affected package paths.
- Prettier runs against changed files (bounded; falls back to full when needed).

Affected computation outputs:

- `artifacts/reports/affected/affected-files.txt`
- `artifacts/reports/affected/affected-packages.json`
- `artifacts/reports/affected/affected-summary.md`

### 3.3 Resume, retries, and concurrency

- `--resume` reuses prior passing/skipped tool results when commit SHA + matrix
  SHA match.
- Bundle summary records per-tool `result_source` (`computed` vs `reused`) and
  `attempts`.
- Tools can define `retries` and `backoff_seconds` in `audit-matrix.yml`.
- `--concurrency N` runs tools in parallel (bounded).

### 3.4 Tool version capture

Each audit bundle captures tool versions (best-effort):

- `artifacts/reports/system-audit/<RUN_ID>/tool-versions.json`

### 3.5 CI caching and integrity

CI implements safe caching:

- pnpm store caching via `actions/setup-node` (`cache: pnpm`)
- `.turbo/` (Turbo local cache)
- `.sonar/cache` (SonarQube cache dir)

Fork safety:

- PRs from forks set `TURBO_REMOTE_CACHE_READ_ONLY=true` so untrusted
  contributions cannot write remote caches.

Cache-bypass integrity:

- `.github/workflows/system-audit-integrity.yml` runs a Tier 1 full-scope job
  with remote cache disabled and Turbo forced.

### 3.6 Implementation status (this repo)

- [x] Affected scope detection + deterministic outputs
      (`tools/audit/affected.py`)
- [x] Mode presets + affected routing
      (`tools/audit/run_audit.py --mode pr|main|nightly|release`)
- [x] Resume across reruns (`--resume`) with conservative safety checks (commit
      SHA + matrix hash)
- [x] Per-tool retry/backoff support (`retries`, `backoff_seconds` in
      `audit-matrix.yml`)
- [x] Bounded parallel execution (`--concurrency`)
- [x] Tool version capture (`tools/audit/tool_versions.py` +
      `tool-versions.json` in bundles)
- [x] CI caching for pnpm/Turbo/Sonar + fork safety
      (`TURBO_REMOTE_CACHE_READ_ONLY`)
- [x] Weekly cache-bypass integrity workflow
      (`.github/workflows/system-audit-integrity.yml`)
- [x] Prettier stability for generated audit evidence (`.prettierignore` ignores
      `artifacts/**`; metrics sync formats JSON via
      `apps/project-tracker/lib/data-sync.ts`)
- [x] Project Tracker audit UI (real-time run + stream)
      (`apps/project-tracker/components/AuditView.tsx`,
      `apps/project-tracker/app/api/audit/*`)
- [x] Attestation schema + validator (`docs/attestation-schema.yaml`,
      `tools/audit/attestation.py`)
- [ ] Cache hit/restore attribution in bundle metadata (not implemented;
      `result_source` currently covers `computed` vs `reused`)
- [ ] Semgrep baseline/diff mode (not implemented; Semgrep is defined but
      disabled by default in `audit-matrix.yml`)
- [ ] Additional tool caches (e.g., Trivy DB, Playwright) once tools are enabled
- [ ] PR comment summary (optional; not implemented)

---

## 4) Remaining / optional follow-ups

- Semgrep baseline/diff mode (when Semgrep is enabled in `audit-matrix.yml`).
- Additional CI caches when tools are enabled (e.g., Trivy DB, Playwright
  browsers).
- PR comment summary (optional).

---

## 5) Codex CLI implementation prompt

Paste the following into Codex CLI to implement/extend these improvements.

### PROMPT START (Codex CLI)

You are Codex CLI acting as a Staff Engineer. Improve the IntelliFlow audit
system iteration speed without breaking existing interfaces.

Hard constraints:

- Backward compatible CLI and artifacts (especially `tools/audit/run_audit.py`
  and `artifacts/reports/system-audit/<RUN_ID>/`).
- Deterministic outputs (sorted/stable formatting; record config hashes).
- Fork safety: untrusted PRs must not write remote caches or leak secrets.
- Audit integrity: keep a periodic cache-bypass job and record enough metadata
  to explain results.

Repo entrypoints:

- Policy: `audit-matrix.yml`, `audit-cutover.yml`
- Runner: `tools/audit/run_audit.py`
- Affected scope: `tools/audit/affected.py`
- Tool versions: `tools/audit/tool_versions.py`
- CI: `.github/workflows/system-audit.yml`,
  `.github/workflows/system-audit-nightly.yml`,
  `.github/workflows/system-audit-integrity.yml`
- Docs: `docs/ops/audit-performance-and-iteration.md`

Work to do (only if missing):

1. Ensure PR mode defaults to Tier 1+2 and affected scope.
2. Ensure bundles record `matrix_sha256`, `tool-versions.json`, and per-tool
   `result_source` + `attempts`.
3. Add safe caching in CI (pnpm, Turbo, Sonar), and protect forks (read-only
   remote cache).
4. Add/maintain a weekly cache-bypass integrity workflow.
5. Add unit tests under `tools/audit/tests/` for:
   - affected package mapping
   - merge/resume behavior
   - retry/backoff behavior

Validate:

- `python -m pytest tools/audit/tests`
- `python tools/audit/run_audit.py --mode pr --base-ref origin/main --resume --concurrency 2`
- Inspect `artifacts/reports/system-audit/<RUN_ID>/summary.md` and
  `tool-versions.json`.

### PROMPT END (Codex CLI)
