# Overnight Autonomous Log — 2026-07-23

Executor: Claude (overnight autonomous mode). Constraints: Docker up, full green
preship on every push (no allow-missing, no `--no-verify`), autonomous
`--admin --squash` merge only when required CI is green, zero fabricated
metrics. Every premise in the assignment was verified against live state before
acting — corrections are recorded below rather than acted on blindly.

## Priority queue (as assigned)

1. P0 — Next.js security dep-bump (clear new advisories, unblock main-red).
2. P0 — Release pipeline failure investigation.
3. P0 — Snyk triage (assignment cited 53 critical + 302 high).

---

## Task 1 — Next.js 16.2.9 → 16.2.11 (security hotfix) ✅ REAL

- **Root cause of main-red confirmed:** the `Security Scanning` workflow
  (`security.yml`, run `29976210173`, main sha `cd82f0ae7`) failed on
  `pnpm audit --audit-level=high`. The gate reported **4 high** Next.js
  advisories, all affecting `>=16.0.0 <16.2.11`, all patched in **16.2.11**:
  - GHSA-6gpp-xcg3-4w24 — App Router middleware / proxy bypass
  - GHSA-m99w-x7hq-7vfj — App Router Server Components DoS
  - GHSA-89xv-2m56-2m9x — SSRF in Server Actions
  - GHSA-p9j2-gv94-2wf4 — SSRF in rewrites
- **Correction to assignment:** the brief cited 2 advisories; there are **4**.
  All are cleared by the same 16.2.11 bump. `next` is a **direct** dependency in
  **two** workspaces (`apps/web`, `apps/project-tracker`), both pinned `16.2.9`
  — not a transitive dep. Root `package.json` had no `next` entry.
- **Fix applied (this branch, `chore/security-next-16-2-11`):**
  - `apps/web/package.json`: `next 16.2.9 → 16.2.11`
  - `apps/project-tracker/package.json`: `next 16.2.9 → 16.2.11`
  - root `package.json` `pnpm.overrides`: add `"next": ">=16.2.11 <16.3"` as a
    defense-in-depth safety net (guarantees every resolution stays on the
    patched line; consistent with the repo's existing override-driven policy for
    ~50 other packages). The override rewrites the lockfile importer specifier
    for both apps to `>=16.2.11 <16.3`, so `--frozen-lockfile` stays consistent.
  - `pnpm-lock.yaml`: reconciled on Node 22 (`next@16.2.11` resolved
    everywhere).
- **Verified:** 0 `next@16.2.9` left in the lockfile;
  `pnpm audit --audit-level=high` no longer reports any `next` advisory.
- **Gate discipline:** full `pre-ship.mjs` run on Node 22 (`.nvmrc` pin) with
  Docker + `intelliflow-postgres-test` up — no allow-missing, no bypass.

## Task 2 — Release pipeline failure ❌ PREMISE NOT REPRODUCED

- `gh run list --workflow=release.yml --limit 5` → the **last 5 `release.yml`
  runs are all `success`** (latest sha `cd82f0ae7`, 2026-07-22 23:28Z). There is
  no failed release run in recent history to investigate.
- What _is_ red on main is `Security Scanning` (Task 1) and `E2E Full Suite` (a
  separate, known-flaky authenticated-E2E surface that does not run in CI PR
  gating — tracked elsewhere). Neither is the release pipeline.
- **Action:** none required for release. Documented as no-op so the next session
  does not chase a non-existent failure.

## Task 3 — Dependency triage (assignment cited 53 critical + 302 high) ⚠️ RECONCILED DOWN

- **Live `pnpm audit` truth (full monorepo, Node 22):** **0 critical**, 13 high,
  21 moderate, 3 low.
- The CI `--audit-level=high` gate (overrides applied, prod scope) sees only the
  **4 `next` highs** — i.e. Task 1 clears the entire high band that actually
  fails the gate. The other 9 "high" entries in the unfiltered local audit
  (`brace-expansion`, `js-yaml`, `shell-quote`, `axios`, `fast-uri`×2,
  `linkify-it`, `@opentelemetry/propagator-jaeger`, `sharp`) are already
  neutralised by existing `pnpm.overrides` at resolution time.
- **No critical advisories exist in the pnpm audit surface** for
  `@intelliflow/adapters`, `@intelliflow/ai-worker`, or anywhere else. The
  assignment's "53 critical + 302 high" (attributed to Snyk) does **not**
  reconcile with the SCA the CI gate actually enforces. Most likely Snyk is
  counting per-path across the full dev dependency graph and/or a different
  policy than `pnpm audit`. **No fabricated bumps were made to chase those
  numbers.**
- **Recommendation for the user (needs Snyk console access — cannot verify from
  the repo):** confirm the Snyk project scope (prod vs dev, per-path vs
  per-advisory dedup) before treating 53/302 as actionable. If a genuine Snyk
  report is exported, each real advisory can be batched into isolated worktree +
  full-preship PRs the same way as Task 1.

---

## Outcome

- **Merged/ready:** Task 1 hotfix PR (see PR link appended on push) — turns main
  `Security Scanning` green.
- **No-op (documented):** Task 2 (release already green), Task 3 phantom
  critical/high counts (unreconcilable; escalated to user, not fabricated).
