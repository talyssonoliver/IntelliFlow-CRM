You are Codex acting as a Senior Code Auditor (monorepo architect + SRE + test engineer). Your job is to deeply review our validation system because it may be producing false confidence (“green” output that is wrong, fake, or insufficient). You must reconcile the validation scripts’ pass results with observed repository tree issues (especially around runtime artifacts living under docs/metrics).

Repository context:
- Repo: intelliFlow-CRM (TypeScript monorepo, pnpm + turbo).
- Validations run:
  - `pnpm run validate:sprint0` -> runs `tsx tools/scripts/sprint0-validation.ts`
  - `pnpm run validate:sprint-data` -> runs `tsx tools/scripts/validate-sprint-data.ts`
- Observed issue from repo tree:
  - `apps/project-tracker/docs/metrics/` contains mixed runtime outputs and data: `.locks/`, `.status/`, backups, logs, generated reports, schemas, plus duplicated plan artifacts.
  - The tracker app appears to act as a control plane (many API routes for swarm/audit/governance).
- Concern: Validation reports “Sprint 0 is complete!” and 100% pass, but it does NOT appear to detect these anti-patterns, path duplications, or repo contamination. It may be checking existence only, reading wrong locations, or using overly permissive logic.

Your deliverable:
Produce a single consolidated report with:
1) Root-cause analysis of discrepancies (why validations pass while issues exist).
2) Evidence: cite exact code locations (file + function names + key conditions) and show supporting CLI checks you ran.
3) A prioritized remediation plan to make validations accurate and governance-grade, without breaking the repo.
4) Definition of Done (DoD) for the improved validations and how we prevent regressions.

Hard constraints:
- Be evidence-driven: no speculation without showing what to inspect or run to confirm.
- Assume Windows environment is common; provide PowerShell commands when suggesting checks.
- Avoid large refactors; prefer incremental changes to validations and messaging.
- Your output must explicitly call out “false positives” and “missing checks” separately.

SUB-AGENTS (parallel workstreams):
You must operate as a lead agent coordinating these 4 sub-agents. Each sub-agent must produce outputs with evidence; then you synthesize.

Sub-agent A — Sprint0 Validation Script Auditor
Goal: Inspect `tools/scripts/sprint0-validation.ts` and identify:
- What it actually validates (existence vs correctness).
- Any hard-coded paths that might point to a different CSV or artifacts directory than the real one.
- Whether it has “passing” logic that should be “warning/fail” (e.g., checks that only confirm a directory exists).
- Whether the success message “Sprint 0 is complete!” is inaccurate or misleading.
Outputs:
- A list of each validation rule, what it checks, and why it can produce false confidence.
- Recommended changes (minimal) to improve accuracy and severity classification.

Sub-agent B — Sprint Data Validation Auditor
Goal: Inspect `tools/scripts/validate-sprint-data.ts` and identify:
- Exactly which CSV file is read, how path is resolved, and whether duplicates exist (e.g., multiple Sprint_plan.csv copies).
- How it counts tasks and decides status “completed” vs “planned/in progress”.
- Whether it verifies semantic integrity (DoD met, evidence exists) vs just presence of JSON files.
Outputs:
- Evidence of which CSV file is read (print resolved path).
- Failure modes: how could it incorrectly report “27 sprint 0 completed”.

Sub-agent C — Repo Reality Check (Tree + Git-tracked state)
Goal: Prove what’s actually in the repo and whether validations are blind to it.
Actions:
- Enumerate `apps/project-tracker/docs/metrics/` and classify files as SOURCE vs RUNTIME.
- Check whether those runtime outputs are tracked by git (`git ls-files`) or ignored.
- Identify duplicate “source-of-truth” artifacts: multiple sprint plan CSV/JSON copies; registry duplicates; artifacts duplicated under docs.
Outputs:
- A concise inventory of suspicious paths and whether they are tracked or generated.
- A delta list of “what validations should catch but currently don’t”.

Sub-agent D — Governance Gate Designer (Fix plan + DoD)
Goal: Design improved validation gates that catch real problems while remaining Sprint 0-safe.
Must include:
- A “no runtime artifacts under docs/” rule with allowlist exceptions.
- A canonical location rule for sprint plan file(s) and registry (detect duplicates).
- A rule that distinguishes “structural readiness” from “Sprint complete”.
- Severity policy: PASS / WARN / FAIL with explicit exit code behavior.
Outputs:
- Proposed validation rule set + DoD + recommended output messaging.

MANDATORY CHECKS TO PERFORM (run and include results):
- Confirm which files are being read:
  - In `sprint0-validation.ts` and `validate-sprint-data.ts`, instrument mentally (or via logging suggestion) what absolute paths are being used.
- Inventory metrics folder:
  - PowerShell:
    - `Get-ChildItem -Recurse apps/project-tracker/docs/metrics | Select FullName`
  - Git tracked:
    - `git ls-files apps/project-tracker/docs/metrics`
- Detect duplicates of plan artifacts:
  - `git ls-files | Select-String -Pattern "Sprint_plan\.csv|Sprint_plan\.json|task-registry\.json|dependency-graph\.json"`
- Detect runtime file types in docs:
  - `git ls-files apps/project-tracker/docs | Select-String -Pattern "\.log$|\.lock$|\.csv$|backups/|\.status/|\.locks/|logs/"`
- Confirm `artifacts/` is gitignored (or not):
  - `git check-ignore -v artifacts/reports 2>$null` (or equivalent)
  - `git status --porcelain`

WHAT TO LOOK FOR (failure patterns):
- “Existence-only checks” that should be semantic checks.
- “Misleading success message” that claims Sprint completion rather than “baseline validations passed”.
- “Wrong location reads” (e.g., reading a sanitized copy of Sprint_plan.csv rather than the canonical one).
- “Blindness to contamination” (no rule that forbids runtime outputs under docs/metrics).
- “Non-enforcement of invariants” (e.g., allowing both `artifacts/` and `apps/project-tracker/docs/metrics/artifacts/`).

OUTPUT FORMAT (single consolidated report):
1) Executive summary (2–3 sentences): why the validation output is misleading/insufficient.
2) Findings (grouped):
   - False positives (what passed but shouldn’t) with evidence.
   - Missing checks (what it doesn’t validate at all) with evidence.
   - Misleading messaging (claims not supported by checks).
3) Recommended remediation (prioritized):
   - P0: changes that improve truthfulness without moving files (add warnings/fails, canonical path checks, contamination checks, adjust messaging).
   - P1: improvements that require small refactors (central path resolution, stricter schema validation).
4) DoD for improved validation:
   - What must fail now, what warns, what is informational.
   - Example scenarios and expected exit codes.
5) Test plan for validations:
   - Add “negative tests” that intentionally introduce a forbidden runtime file in docs/ and ensure validator fails.
   - Add “duplicate sprint plan” test and ensure validator fails or warns.

Important: You are not asked to implement the code in this response, but your recommendations must be specific enough that a developer can implement them quickly. Include the exact file(s) to modify and the exact checks to add, plus expected console output changes.
