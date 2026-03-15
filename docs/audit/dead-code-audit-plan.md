# Dead-Code Audit & Structural Cleanup (3,782 flagged files)

**TL;DR:** The 3,782-file figure comes from a **real, working knip run** executed by the project tracker's own API route (`apps/project-tracker/app/api/code-analysis/route.ts`), cached on 14 Mar 2026. The number is inflated — but not by a broken script. The inflation comes from `knip.json` missing exclusions for `dist/**`, `coverage/**`, `.next/**`, and `generated/**` build artifacts (clearly visible in the screenshot: `packages/sdk/dist/index.cjs`, `packages/api-client/dist/index.js`, `apps/workers/notifications-worker/dist/main.mjs`, `apps/workers/notifications-worker/coverage/base.css`). After fixing exclusions and adding per-workspace entry-point declarations, the genuine issue count will be significantly lower — but still substantial given the pre-audited dead tRPC modules and orphaned code. The plan fixes the knip config first to get a clean baseline, then triages real dead code by risk tier — using the existing `dead_endpoints.csv` as an anchor.

---

## Phase 0 — Fix Broken Tooling (Prerequisite)

1. **Separate the two analysis pipelines and make both work correctly:**
   - **Project tracker UI** (`apps/project-tracker/app/api/code-analysis/route.ts`) — already runs `npx knip --reporter json --exclude unlisted,unresolved --no-gitignore` correctly via `execSync`, captures stdout from non-zero exits, and caches to `artifacts/reports/code-analysis/latest.json`. This is the source of the 3,782 number. No change needed to the runner itself.
   - **CI script** (`pnpm quality:deadcode`) — wraps knip in `node scripts/run-soft.js`, which always exits 0 regardless of knip's findings. This makes the CI quality gate a silent no-op. See detailed breakdown below.

   **`run-soft.js` root cause:**
   `scripts/run-soft.js` was written as a cross-platform `|| true` replacement for commands that should *never* block CI (originally designed for `depcheck` during early setup). It unconditionally calls `process.exit(0)` after any non-zero exit code, printing only a `[WARN]` to the terminal:
   ```js
   // scripts/run-soft.js lines 38–43
   if (code !== 0) {
     console.warn(`[WARN] Ignoring non-zero exit code (${code}) from: ...`);
   }
   process.exit(0); // ← always succeeds
   ```
   When knip finds 3,782 issues it exits non-zero — `run-soft.js` swallows it, `pnpm quality:check` passes green, and **no developer or CI pipeline ever sees the failures.** The wrapper is correct for depcheck (optional advisory tool), but **wrong for knip** (mandatory quality gate).

   **Fix:** In `package.json`, change:
   ```json
   "quality:deadcode": "node scripts/run-soft.js knip --exclude unlisted,unresolved"
   ```
   to:
   ```json
   "quality:deadcode": "pnpm exec knip --exclude unlisted,unresolved --reporter json --output-file artifacts/reports/knip-output.json"
   ```
   This lets knip exit non-zero (failing `quality:check`) and persists a machine-readable report for the tracker dashboard to consume instead of re-running knip on every UI request.

2. **Remove depcheck** from `package.json` scripts and remove the `quality:deps` invocation — depcheck was officially archived in June 2025; its full functionality is already covered by knip v5. Document the decision in an ADR.

---

## Phase 1 — Harden `knip.json` Configuration

3. **Add per-workspace entry-point declarations** to `knip.json` for the four major workspaces currently using default patterns:
   - `apps/web` → Next.js App Router: `app/**/page.tsx`, `app/**/layout.tsx`, `app/**/route.ts`
   - `apps/api` → tsup multi-entry: `src/main.ts`, `src/ws-server.ts`
   - `apps/ai-worker` → tsup entry: `src/index.ts`, `src/worker.ts`
   - `packages/*` → tsup standard: `src/index.ts`

   This alone will eliminate the majority of false positives.

4. **Add `dist/**`, `generated/**`, and `.next/**` to the root `ignore` list** in `knip.json` — currently `dist/` is absent, meaning tsup content-hash chunks like `packages/adapters/dist/prompt-sanitizer-DNGOVJBP.mjs` skew results. Also add Storybook `.stories.tsx` files as `entry` patterns for `packages/ui`.

5. **Replace 120+ blanket `ignoreIssues` suppressions with structured `@knip-ignore` TSDoc tags** on intentionally-public exports (ports, webhook handlers, seed utilities) so `knip.json` becomes a configuration file rather than a skip-list. This is the foundational step that makes output trustworthy.

---

## Phase 2 — Generate the Real Baseline

6. **Re-run the analysis from the tracker UI** ("Run Analysis" button) after the `knip.json` exclusion fixes in Phase 1 to generate a clean baseline. The full JSON is already cached to `artifacts/reports/code-analysis/latest.json` — the post-fix run will overwrite it with a number that reflects only genuine dead code. For deeper per-package breakdown, additionally run:
   ```
   pnpm exec knip --workspace packages/domain --cache --reporter json
   pnpm exec knip --workspace packages/validators --cache --reporter json
   pnpm exec knip --workspace apps/api --cache --reporter json
   ```

7. **Cross-reference knip output against the existing `artifacts/dead_endpoints.csv`** (112 rows, pre-audited) to validate the 69 `DEAD_FEATURE` procedure entries — this is the highest-confidence deletion list in the repo already.

---

## Phase 3 — Audit Each Flagged File

This is the analytical core of the plan. No file is touched until it has been
audited through all four lenses below. The output of this phase is a verdict
for every file: **EXCLUDE** | **KEEP** | **REFACTOR** | **DEPRECATE** | **DELETE**.
That verdict list feeds Phase 4.

### Step 1 — Set Up the Forensics Tools (One-Time)

Before auditing individual files, wire up the tools that answer the "when/how
was it created" and "what breaks if I touch it" questions.

**madge** — dependency graph & reverse-lookup:
```bash
# Add to root package.json scripts
"analyze:deps":     "madge --extensions ts,tsx --json apps/api/src > artifacts/reports/madge-api.json",
"analyze:circular": "madge --extensions ts,tsx --circular packages/ apps/",
"analyze:graph":    "madge --extensions ts,tsx --image artifacts/reports/dep-graph.svg apps/api/src"
```

Create `.madgerc.json` at root:
```json
{
  "detectiveOptions": { "ts": { "mixedImports": true, "skipTypeImports": true } },
  "fileExtensions": ["ts", "tsx"],
  "tsConfig": "tsconfig.json"
}
```

**dependency-cruiser** — architectural boundary enforcement:
`^17.3.4` is already installed at root and in `tests/architecture/`, but no
`.depcruise.js` config exists. The `tests/architecture/` tests use hand-written
vitest regex scans that duplicate what dep-cruiser does natively. Create the
config (see Specialized Tools section below for full `.depcruise.js`).

**TypeScript strict flags** — intra-file dead code detection:
`noUnusedLocals` and `noUnusedParameters` are only set in
`apps/ai-worker/tsconfig.json`. Add to the root `tsconfig.json` so the
compiler flags dead locals in every package. Each TypeScript error that appears
is a confirmed dead-code signal, not a blocker — add `_` prefix to
intentionally unused parameters (`_req`, `_ctx`) per convention.

---

### Step 2 — Per-File Decision Tree

Every file flagged by knip must pass through this tree. Do not skip steps.

```
1. Is it in dist/**, coverage/**, .next/**, or generated/**?
   YES → verdict: EXCLUDE
         Action: add to knip.json ignore list, never delete

2. Is it a test file?
   YES → verdict: KEEP for now
         Action: re-evaluate after its implementation file receives a verdict

3. Forensics — run git log:
   git log --diff-filter=A --follow --format="%ad %an %s" -- <file>
   → Was it created by a scaffold script, generator, or "chore: auto" commit?
   YES → verdict leaning DELETE (stale scaffolding)
         Confirm by checking if the generator/script still exists

4. Risk propagation — run madge reverse lookup:
   pnpm madge --json --extensions ts,tsx <workspace>/src | \
     node -e "const g=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); \
     const f='<rel-path>'; \
     console.log(Object.entries(g).filter(([,v])=>v.includes(f)).map(([k])=>k))"
   → Does anything depend on it?
   YES → this file IS being reached; knip has a missing entry point
         verdict: EXCLUDE (fix knip config, do not delete)

5. Is it a PORT or INTERFACE in packages/domain/ or packages/application/?
   YES → verdict: KEEP
         Action: add // @knip-ignore — intentional port, implementation pending

6. Does a Sprint task in Sprint_plan.csv reference this feature?
   YES → verdict: KEEP, move to feature branch
         Action: add @knip-ignore with Sprint task ID in comment

7. Is it a DEAD FEATURE — no UI callers, no Sprint task?
   YES → verdict: DELETE
         Continue to Step 9 to measure deletion risk first

8. Are only SOME exports unused (file itself IS reachable)?
   YES → verdict: REFACTOR
         Action: remove only the flagged exports/types; keep the file
         (knip surfaces these as "exports"/"types" issues, not "files")

9. Is it a TYPE or SCHEMA file?
   YES → Schema drift check:
         grep -r "$(basename $file .ts)" packages/db/prisma/schema.prisma
         If Prisma model no longer exists → verdict: DELETE (schema drift)
         If Prisma model exists but fields differ → verdict: REFACTOR

10. Is it a DESIGN SYSTEM component, token, or enum?
    YES → verdict: DEPRECATE first, then DELETE after one sprint
          Action: add @deprecated JSDoc before any deletion commit
```

---

### Step 3 — Type Safety Analysis

Knip's JSON output surfaces more than file counts. Parse
`artifacts/reports/code-analysis/latest.json` for these categories which
directly map to type-safety risk:

**`enumMembers` → Deprecated design system tokens**
Unused enum members are the TypeScript equivalent of deprecated CSS tokens.
```json
"enumMembers": { "Status": [{ "name": "Deprecated", "line": 23 }] }
```
Audit targets: `packages/domain/src/**/*Constants.ts`, variant enums in
`packages/ui/src/`, module/feature-flag enums in `packages/domain/src/platform/`.
Before verdicting DELETE, grep the member name across the monorepo — if it
appears in a Zod `.enum([...])` call, that is active schema drift.

**`types` → Broken Zod ↔ tRPC ↔ UI traceability chain**
A flagged type export means the type chain is broken somewhere. For every
flagged validator file, trace the full chain:
```
packages/validators/src/<X>.ts  →  apps/api/src/modules/<X>.router.ts (input:)
  →  apps/web/src/  (useForm<z.infer<typeof XSchema>>)
```
A break at any link means the UI is either using `any` or receiving untyped
data — not just dead code, but an active type safety hole.

**`as any` / `@ts-ignore` debt in flagged files**
Before issuing any DELETE verdict, scan the file:
```bash
grep -n "as any\|@ts-ignore\|@ts-expect-error" <file>
```
If found: the file was masking type errors. Deleting it is safe, but log each
occurrence to `artifacts/debt-ledger.jsonl` as evidence of the bypass that
existed. This builds an audit trail showing what type safety was restored.

---

### Step 4 — Design System Enforcement Audit

Run this as a dedicated pass over `packages/ui/src/` and `apps/web/src/`,
separate from the general triage.

**Component inventory — verify before any DELETE verdict:**
```bash
# Check if components flagged by knip are imported via barrel anywhere
grep -r "from '@intelliflow/ui'" apps/web/src/ | grep -E "confirmation-dialog|sheet|dropdown-menu|icon-mapping"
```

**Duplicate variant detection:**
Parse the `duplicates` array in the knip JSON output. Each entry is a symbol
exported under two names from the same or different files — these are the
"duplicate component variants" that degrade design system consistency. Every
entry gets a REFACTOR verdict: consolidate to one canonical export.

**CSS variable token drift:**
```bash
# Tokens defined in globals.css but referenced nowhere in components
grep -oP "var\(--[^)]+\)" packages/ui/src/app/globals.css | sort -u > /tmp/defined-tokens.txt
grep -roh "var\(--[^)]+\)" packages/ui/src/ apps/web/src/ | sort -u > /tmp/used-tokens.txt
comm -23 /tmp/defined-tokens.txt /tmp/used-tokens.txt
```
Each result is a stale CSS token — verdict: DELETE from globals.css.

**`@deprecated` workflow (mandatory before any UI DELETE):**
```typescript
/**
 * @deprecated Use `<NewComponent>` from '@intelliflow/ui' instead.
 * Will be removed in Sprint 8. Tracked: IFC-XXX
 * @see NewComponent
 */
export const OldComponent = ...
```
The tag triggers `@typescript-eslint/no-deprecated` warnings at every import
site, surfacing callers that knip missed (dynamic imports, barrel re-exports)
before the deletion commit lands. Wait one sprint for warnings to propagate
before issuing the final DELETE.

---

### Step 5 — Risk Propagation Scoring

Before executing any DELETE verdict from Steps 2–4, score the deletion risk
using the madge dependency graph:

| Dependents | Risk | Required action before delete |
|-----------|------|-------------------------------|
| 0 | 🟢 Safe | Delete — no impact |
| 1–3 | 🟡 Low | Review each dependent manually |
| 4–10 | 🟠 Medium | Run `pnpm tsc --noEmit` before + after |
| 11+ | 🔴 High | Full test suite + manual review required |

Circular dependencies (from `analyze:circular`) are a special case — a file
in a cycle **cannot** be safely deleted without resolving the cycle first.
Circular deps are the root cause of files that appear unused but cause breakage
when removed. Resolve cycles before attempting deletions.

---

### Step 6 — Audit Output per File

For each audited file, produce a one-line record:

```
<filepath> | <verdict> | <risk> | <reason> | <action>
apps/api/src/modules/analytics/analytics.router.ts | DELETE | 🟢 0 deps | DEAD_FEATURE no UI callers no Sprint task | remove + deregister from router.ts
packages/validators/src/appointment.ts             | DELETE | 🟢 0 deps | schema drift — Appointment not in Prisma schema | remove
packages/ui/src/components/sheet.tsx               | DEPRECATE | 🟡 2 deps | no direct callers found via barrel import | add @deprecated Sprint 7, delete Sprint 8
packages/adapters/src/antivirus/ClamAVScanner.ts   | DELETE | 🟢 0 deps | adapter for removed integration (PayPal/ClamAV) | remove with paypal/ dir
```

Collect all records into `artifacts/reports/dead-code-audit-verdicts.csv`
before starting Phase 4.

---

## Phase 4 — Act on Audit Findings

Only files with a **DELETE**, **REFACTOR**, or **DEPRECATE** verdict from
Phase 3 are touched here. The tiers below group them by execution complexity,
not by assumed safety — safety was already established in Phase 3.

### Tier 0 — tRPC Dead Feature Modules (DELETE, 🟢 risk, 3-file change each)

Each deletion requires: router file + unregister from `apps/api/src/trpc/router.ts` + test file.
Skipping the router registration removal causes a TypeScript compile error.

Confirmed DELETE verdicts from `dead_endpoints.csv` (69 DEAD_FEATURE entries):
- `apps/api/src/modules/agent/`
- `apps/api/src/modules/analytics/`
- `apps/api/src/modules/intelligence/`
- `apps/api/src/modules/integrations/`
- `apps/api/src/modules/experiment/`
- `apps/api/src/modules/routing/`
- `apps/api/src/modules/subscription/`
- `apps/api/src/modules/zep/`

Matching orphaned UI pages (DELETE, confirmed no route references):
- `apps/web/app/(admin)/governance/`
- `apps/web/app/(admin)/settings/`

### Tier 1 — Dead Adapters, Ports, Constants, Events (DELETE after audit verdicts)

Execute only files that received a DELETE verdict in Phase 3. Candidates:
- `packages/adapters/src/antivirus/` — ClamAV, no production path
- `packages/adapters/src/payments/paypal/` — only Stripe used
- `packages/adapters/src/messaging/twilio/` — only email messaging used
- `packages/adapters/src/external/GuardrailsAIService.ts`
- API security stubs: `encryption.ts`, `key-rotation.ts`
- Domain ports: `AnalyticsRepositoryPort.ts`, `NotificationServicePort.ts`, `CalendarServicePort.ts`
- Domain constants: `RoutingConstants.ts`, `TimelineConstants.ts`, `TicketConstants.ts`, `AIConstants.ts`
- Domain events: `TicketEvents.ts`, `TaskEvents.ts`, `ChainVersionEvents.ts`
- Web lib: `cache-profiles.ts`, `cache-tags.ts`, `agent/rollback-service.ts`

### Tier 2 — Zod Validator Schema Drift (REFACTOR or DELETE after schema check)

Run Step 3 schema drift check against `packages/db/prisma/schema.prisma` for
all 42 validator files. Only delete after Phase 3 verdict is confirmed.

DELETE candidates (schema drift or no tRPC router `input` reference):
- `appointment.ts`, `bulk-operations.ts`, `experiment.ts`, `routing.ts`,
  `sla-policy.ts`, `timeline.ts`, `ticket-routing.ts`, `platform-metrics.ts`, `feedback-survey.ts`

Do not touch (active in tRPC + web forms):
- `lead.ts`, `contact.ts`, `account.ts`, `opportunity.ts`, `task.ts`,
  `ticket.ts`, `common.ts`, `auth.ts`, `user.ts`

### Tier 3 — Tools / Scripts (ARCHIVE or DELETE after git forensics)

Run Step 2 forensics on each. One-shot migration scripts from completed sprints:
- `fix-csv-v3.ts`, `backfill-*.ts`, `convert-csv-to-contract-tags*.ts`, `migrate-*.ts`
- Sprint validation scripts for already-completed sprints 0–5

Keep (active, called by CI or developer workflow):
- `split-sprint-plan.ts`, `validate-sprint-data.ts`, `sync-api-inventory.ts`, `health-check.ts`

### Tier 4 — UI Components & Hooks (DEPRECATE first, DELETE one sprint later)

Apply `@deprecated` JSDoc in this sprint, execute DELETE only after the
deprecation sprint has surfaced any hidden callers:
- `confirmation-dialog.tsx`, `sheet.tsx`, `dropdown-menu.tsx`
- `icon-mapping.ts`, `layout-builder/types.ts`

DELETE immediately with Tier 0 (no consumers confirmed via barrel grep):
- `experiment/ExperimentDashboard.tsx`

---

## Phase 5 — Enforcement & Prevention

### Knip as Blocking CI Gate
Replace `run-soft.js` wrapper in `quality:deadcode` with a direct knip
invocation. Wire `--max-issues 0` into the `quality` Turbo pipeline so any new
unused export fails the build. Use `--reporter github-actions` on PRs for
inline annotations.

### dependency-cruiser as Living Architecture Docs
Create `.depcruise.js` at root (config in Specialized Tools section). Replaces
the grep-based vitest architecture tests with AST-enforced rules that fail CI.
When a developer asks "can `packages/adapters` import from `packages/domain`?"
the answer is in the rules file, enforced by CI, not a README.

### Feature-Flag-First Development
The existing `packages/platform/src/feature-flags/` system must be the
mandatory entry point for any new backend module. Code is only built when the
feature flag is active. This prevents the Tier 0 cycle: complete backend
modules built with no UI, silently accumulating as dead code.

### Sprint Ceremony Additions (from Sprint 7)
**Definition of Done:**
- [ ] `pnpm exec knip --workspace <changed-package>` — zero new issues
- [ ] No new `ignoreIssues` entry in `knip.json` without a justification comment
- [ ] New features behind a feature flag until UI is wired

**PR template** (`.github/pull_request_template.md`):
```markdown
## Dead Code Check
- [ ] `pnpm exec knip` — no new unused files/exports
- [ ] New adapters have corresponding tRPC procedures wired to UI
- [ ] New Zod schemas are referenced by at least one tRPC router input
```

---

## Key Findings & Risk Notes

### Where the 3,782 number comes from — and why it's inflated
- The number is **real output from a working knip run** on 14 Mar 2026 via the project tracker API route (`apps/project-tracker/app/api/code-analysis/route.ts`). Knip is correctly invoked with `--reporter json --exclude unlisted,unresolved --no-gitignore`, stdout is captured from non-zero exits, and results are cached to `artifacts/reports/code-analysis/latest.json`.
- The inflation is caused by `knip.json` **not excluding build artifacts**. The screenshot makes this explicit — the first entries in "Unused Files" are dist outputs and coverage reports:
  - `packages/sdk/dist/index.cjs`, `packages/sdk/dist/index.js`
  - `packages/api-client/dist/index.js`, `packages/api-client/dist/index.mjs`
  - `apps/workers/notifications-worker/dist/main.mjs`
  - `apps/workers/notifications-worker/coverage/base.css`
- The current `knip.json` `ignore` list only excludes `**/.tsup/**` and `**/migrations/**` for build artifacts. Missing: `**/dist/**`, `**/coverage/**`, `**/.next/**`, `**/generated/**`.
- A secondary inflation source: no per-workspace `entry` declarations for tsup-built packages and Next.js App Router pages, so knip uses default patterns that miss many legitimate entry points.

### CI gate is silently broken — separate issue
- `pnpm quality:deadcode` uses `node scripts/run-soft.js knip ...` which always exits 0. This is a **separate problem** from the tracker's working analysis pipeline. It means CI never fails on dead code, but it doesn't affect the accuracy of the numbers shown in the tracker.

### Real expected count after config fixes
After adding correct entry-point declarations and `dist/**` exclusions, the genuine issue count is estimated at **300–800 files** (not 3,782).

### Depcheck is archived — drop it
Depcheck was officially archived June 16, 2025. Its functionality is a strict subset of knip v5. The `quality:deps` script can be replaced with a knip workspace-level dependency check.

### AI Worker experimental code
`apps/ai-worker/src/agents/**`, `chains/**`, `examples/**` is fully knip-ignored. Consider moving it to an `experiments/` directory outside the main build graph to prevent accidental imports.

### False-positive sources (exclude from all analysis)
- `packages/*/dist/**` — tsup content-hash chunks (e.g. `prompt-sanitizer-DNGOVJBP.mjs`)
- `packages/db/generated/**` — Prisma auto-generated client
- `**/.next/**`, `**/.turbo/**`, `**/node_modules/**`
- `artifacts/**` — output only, not source

---

## Audit Tiers Summary

Tiers describe the **audit category** — the type of analysis work required and
the typical verdict pattern. Actions are determined per-file in Phase 3, not
prescribed up front.

| Tier | Category | Est. Files | Phase 3 work | Typical verdict |
|------|----------|-----------|--------------|-----------------|
| 0 | tRPC dead feature modules | 50–80 | Cross-ref dead_endpoints.csv + router registration check | DELETE (3-file change each) |
| 1 | Dead adapters, ports, constants, events | 100–150 | Risk propagation score + dependency check | DELETE after Phase 3 forensics |
| 2 | Zod validator schemas | 9–15 | Schema drift check vs Prisma + tRPC input grep | DELETE or REFACTOR |
| 3 | One-shot migration tools/scripts | 20–40 | Git forensics — creation date + author | ARCHIVE or DELETE |
| 4 | UI components, hooks, tokens | 10–20 | Barrel import grep + CSS token diff + `as any` scan | DEPRECATE → DELETE one sprint later |
| 5 | Build artifacts / generated | ~∞ | N/A — configuration fix only | EXCLUDE from analysis |
| 6 | AI Worker experimental code | 30–50 | Decision: src/ or experiments/ directory | MOVE to experiments/, keep ignored |
| 7 | Tests for dead features | TBD | Audit after Tier 0–3 verdicts are executed | DELETE after implementation is gone |
