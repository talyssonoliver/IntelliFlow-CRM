# Delivery Report: PG-199

**Run ID**: 20261019115522-8efea6fc
**Date**: 2026-10-19
**Task**: PG-199 — Module Settings – Model Config (`/agent-approvals/model-config`)
**Branch**: `feat/pg-199-model-config` (worktree `intelliFlow-CRM-worktrees/pg-199`), 28 commits on merge-base `797904a36`, not pushed (runner ships)
**Verdict**: **NEEDS_HUMAN**: everything is implemented and validated, but the Lighthouse ≥ 90 gate needs an authenticated run that cannot be done here (no test credentials; the only Supabase configured is production).

## Implementation Summary

Per-tenant model settings for each AI purpose (owner Q1: scoring, qualification, email, reasoning, structured, rag): an allow-listed model pin, an ordered fallback chain, temperature, max tokens, and a monthly cost ceiling. Never-Downgrade (owner R2/Q4/Q7-B) applies: a strictly cheaper model (input + output price), as primary or fallback, needs one combined confirmation. The server enforces this (`PRECONDITION_FAILED DOWNGRADE_UNCONFIRMED`), and every change is audited with the actor.

| Layer | What |
|---|---|
| domain | `packages/domain/src/ai/model-config/{catalog,defaults,rules,index}.ts`: 13-model catalog, caller default tiers, `MODEL_CONFIG_LIMITS`, price ranking, `findDowngrades` |
| validators | `packages/validators/src/model-config.ts`: superRefine for duplicate purposes ("items N and M"), the rag lock and fallback rules |
| db | `TenantAIConfig` (tier nullable, modelId, fallbackModelIds, monthlyCostCeilingCents), migrations `20261019120000_tenant_model_config` (named CHECKs, NOT VALID then VALIDATE) and `20261019120100_tenant_ai_config_rls` (separately removable; ENABLE not FORCE; DO/duplicate_object guard) |
| application / adapters | `PurposeSpendPort` and `PrismaPurposeSpendRepository` (atomic, LEAST-clamped per-purpose spend in centicents) |
| api | `apps/api/src/modules/agent/model-config.router.ts` (`modelConfig.get/update/resetToDefaults`): admin gate, explicit tenantId, advisory lock, per-purpose `expected` → CONFLICT, P2002 → CONFLICT, audit `model_config` |
| ai-worker | tenant pins (LiteLLM `catalog-<id>` stanzas; OpenRouter where mapped), fallback chain (429/5xx/timeout/breaker), ceiling checked before every call, single metering site in the tracer (chat, structured and embeddings), per-purpose spend recorder, agents and the summary job on tenant settings, rag jobs delayed 15 min at the ceiling (never dead-lettered), email shows "monthly AI ceiling reached for email" |
| web | `apps/web/src/app/agent-approvals/model-config/**` (page shell, content, loading, PurposeCard, FallbackList, page model), shared `lib/trpc-errors.ts`, settings-search entry |
| docs | ADR-082 (Proposed), ADR-048 amendment note, PRD addendum and delivery note, page registry, PAGE_MAP, sitemap, nav-reachability, ui-flow-mapping/IA counts, dependency chains, WCAG statement 1.11.0, VPAT 1.12.0, debt ledger (7 entries) |

Files: 77 added, 68 modified (`git diff --name-status 797904a36..HEAD`).

### Gemini embedding price (plan Step 1)

`gemini-embedding-001` is priced at $0.15 per 1M input tokens. Source: the OpenRouter API pricing for `google/gemini-embedding-001` (prompt 0.00000015/token), cross-checked against third-party listings on 2026-10-19. Google's current pricing page lists only `gemini-embedding-2`. Recorded in `packages/domain/src/ai/model-config/catalog.ts:157-159` and `apps/ai-worker/src/config/ai.config.ts:270-273`.

## TDD Log

Every RED was observed before the matching implementation, with a log in `logs/`. Steps 1–27 are `NN-red.txt` → `NN-green.txt`.

The fixes from review were proven RED retroactively: the new tests were run against the pre-fix source, then the fix was restored.

- `32-codexfix-red-ai-worker.txt` and `32-codexfix-red-api.txt`: 7 tests failed before the round-1 fixes.
- `32-codex2-red-spend.txt` and `32-codex2-red-ceiling.txt`.
- `32-codex3-red-agents.txt` and `32-codex3-red-pricing.txt`.
- `32-codex4-red.txt`.

Each has a matching green log.

## Acceptance Criteria Validation

| AC | Status | Evidence |
|---|---|---|
| AC-001 page + bento, 6 cards, no "coming soon" | MET | `ModelConfigContent.test.tsx`, `page.test.tsx` |
| AC-002 model/temperature/tokens/fallbacks/ceiling editing | MET | `PurposeCard.test.tsx`, `FallbackList.test.tsx`, `model-config-model.test.ts` |
| AC-003 rag locked except ceiling | MET | PurposeCard rag test; validator rag-lock tests |
| AC-004 one combined downgrade confirm; server refuses without ack | MET | content test (2 downgrades in one dialog); router `PRECONDITION_FAILED` tests (including legacy tier overrides, commit a18e8d43e) |
| AC-005 lateral = no confirm; audit with actor and flags | MET | router lateral and audit tests |
| AC-006 admin-only writes, view-only UI | MET | router FORBIDDEN test; content view-only test |
| AC-007 explicit tenantId, cross-tenant negative | MET | router test `:161`; integration test (two tenants, RLS) |
| AC-008 transaction, advisory lock, CONFLICT | MET | router tests `:228-315`; content "Reload latest" test |
| AC-009 superRefine duplicates | MET | validators tests |
| AC-010 unchanged purposes not written; tier NULL; tier never sent | MET | router skip test; page payload tests |
| AC-011 reset keeps rate limits; confirm lists reset vs kept | MET | router reset test; content reset test (including the server-found downgrade retry) |
| AC-012 calm NOT_FOUND notice, no write | MET | content NOT_FOUND test |
| AC-013 pins on LiteLLM/OpenRouter, unmapped → default + warn, priced as the model that runs | MET | `createLLMForTenant.test.ts` |
| AC-014 fallback chain on 429/5xx/timeout/breaker, structured too | MET | `withModelFallbacks` tests |
| AC-015 ceiling blocks the purpose, non-AI fallbacks run; agents fail visibly | MET | `purpose-fallbacks.test.ts`; agent ceiling tests (d9b39f262); per-call guard (3bc7293b7) |
| AC-016 email "monthly AI ceiling reached for email"; page shows the block | MET | auto-response chain test; PurposeCard/content blocked-badge tests |
| AC-017 rag delayed 15 min, never dead-lettered; retrieval shows the ceiling | MET | contact-embed and ingestion worker tests; rag-context test |
| AC-018 metered once per call per purpose, including structured output | MET | `usage-metering.test.ts` (real ChatOpenAI with a fake fetch); misattribution recorders removed |
| AC-019 agents and the summary job use tenant config, billed to that tenant | MET | `base.agent.test.ts` (job-tenant fallback, tenant context, d54456c5f); summary job test |
| AC-020 pre-migration DB → no ceiling and a logged reason; DB outage → cached, then open | MET | `tenant-ai-config.test.ts`, `purpose-ceiling.test.ts` |
| AC-021 migrations Class A, RLS separate | MET | `tests/integration/model-config.test.ts` 15/15 (migrate deploy and db-push simulation) |
| AC-022 settings search 13 → 14 | MET | `settings-search.test.ts` |
| AC-023 header link to AI Settings; ChainVersion issues filed | MET | content test; gh #924, #925 |
| AC-024 catalog ⇄ MODEL_PRICING ⇄ LiteLLM parity | MET | `model-config-parity.test.ts` |
| AC-025 PRD, ADR-082, page docs, counts | PARTIAL | All updated. ADR-082 stays **Proposed** because the Lighthouse gate is open (plan Step 32: flip only after every gate passes). |
| AC-026 CSV artifact path + splits | MET | CSV row path `modules/agent`; `_I` changes only the PG-199 row; `_J` equals merge-base |
| AC-027 dependency chains | MET | `complete-dependency-chains.md`, `ai-output-review-dependency-chain.md` |
| AC-028 Lighthouse ≥ 90 authenticated | **NEEDS_HUMAN** | `artifacts/lighthouse/PG-199/README.md` |

## Definition of Done (CSV)

| Item | Status | Evidence |
|---|---|---|
| Per-agent model, temperature, max tokens, fallback chain, cost ceilings | MET | one row per purpose (owner Q1-A) |
| Never-Downgrade for model ids | MET | domain `findDowngrades`; router refusal; one confirm; audit |
| PageHeader + bento | MET | `ModelConfigContent.tsx` |
| Canonical EmptyState (entity + phase=passive) | MET | `FallbackList.tsx`: `entity="rules" phase="passive"` with fallback copy |
| System-compliant CTAs | MET | PageHeader actions, Title Case, 44 px targets |
| TagsTab via forwardRef | N/A | no tags card (rows are keyed by purpose) |
| `$transaction` on destructive writes | MET | update/reset in `$transaction` under an advisory lock |
| No skipDuplicates | MET | grep of the branch diff |
| Zod superRefine for duplicate keys | MET | `updateModelConfigSchema` |
| colorToken CHECK | N/A | rows are keyed by purpose and not user-labelled, so there is no colour token |
| AI defaults FALSE | N/A | no Boolean column or toggle; "no ceiling" is empty, "block" is $0 |
| Wire every Boolean toggle / category-2 under IFC-310/311/312 | N/A | no Boolean toggles |
| Cross-tenant negative test | MET | router `:161`; integration test |
| Lighthouse ≥ 90 | NEEDS_HUMAN | see below |
| verified by `pnpm test` | MET | full validation matrix |

## Validation Commands (all executed in this session)

These are from the final matrix, 2026-10-19 14:18–14:33Z, run one at a time with the slot wrapper (`logs/32-matrix-summary.txt`).

| Command | Result |
|---|---|
| `pnpm --filter @intelliflow/domain test` | 3152 passed |
| `pnpm --filter @intelliflow/validators test` | 2817 passed |
| `pnpm --filter @intelliflow/application test` | 1494 passed |
| `pnpm --filter @intelliflow/adapters test` | 2989 passed |
| `pnpm --filter @intelliflow/api test` | 7942 passed, 2 skipped |
| `pnpm --filter @intelliflow/ai-worker test` | 2365 passed, 10 skipped |
| `pnpm --filter @intelliflow/web exec vitest run` | 13191 passed (840 files) |
| root `route-total-consistency.test.ts` | 15 passed |
| integration `tests/integration/model-config.test.ts` (exclusive DB slot, local :5433 only) | 15 passed |
| typecheck (7 packages) | exit 0 |
| lint (7 packages) | exit 0 |
| `pnpm turbo build` (packages + api + ai-worker + web) | 16/16 tasks |
| page co-change, nav wiring preflights | exit 0 |
| `validate-artifacts PG-199` | exit 1. This is structural: the plan lists 107 files and the CSV lists 5 deliverables. All 5 CSV artifacts are in the plan and on disk (plan Step 29 note). |
| `git ls-files` hygiene (`.log/.coverage/.tsbuildinfo`) | 0 |
| `pnpm run format:check` | exit 0 |
| `pnpm run lint:artifacts` | exit 0 (102 pre-existing warnings, none on PG-199 files) |
| `tests/architecture pnpm test` | 40 passed |
| scoped coverage + `check-diff-coverage.mjs` vs merge-base | **95.1%** new-line coverage (1304/1371), floor 80% |
| sonar guard (CI mode, 83 changed TS files) | exit 0 |
| new-code duplication (jscpd over touched dirs) | 1.03% (35/3408 new non-test lines) |
| knip | no new findings in changed files |
| bundle check | the domain catalog is in a chunk shared with approval-policies; route-only chunk 38.9 KB |
| glyph audit | OK (`checklist` used instead of adding `fact_check`) |

**Disclosure:** one small test file (`tenant-ai-spend.test.ts`, a RED run for a codex finding) ran while a background matrix was running. That broke the one-test-process rule, and it was a mistake. The matrix was rerun in full afterwards; the numbers above are from that clean run.

## Reviews

- **Codex review** (`scripts/codex-review.mjs --base=797904a36`), five rounds. Rounds 1–4 found 9 real defects, and all were fixed with tests:
  - structured output not metered;
  - agents ignored the job tenant;
  - ignored pins priced as the pin;
  - a legacy tier override was not counted as a downgrade;
  - retried spend was counted twice in the cache;
  - the ceiling was checked only when the model was built;
  - agents turned a ceiling error into a fallback answer;
  - OpenRouter calls were priced with the LiteLLM alias;
  - tasks were billed to the wrong tenant.

  Round 5: PASS, 0 findings.
- **a11y-expert** (WCAG 2.1 AA) returned FAIL with 4 major findings. All are fixed in ef870c036 (`a11y-review.md`). Two minor items are kept with reasons (toast plus live-region pattern as in PG-198; shared EmptyState region role).
- **`/code-review`** (quick mode, sprint 18, linked to PG-199): 0 typecheck errors and 0 lint errors across 26 packages.
- **`/sonarqube-fix`**: no SonarQube MCP or local issues file. The local checks (sonar guard, duplication) are clean, and nothing needed fixing.

## MATOP Validation

| STOA | Verdict | Notes |
|---|---|---|
| Foundation | PASS | after format, artifact-lint and architecture logs were added |
| Domain | PASS | depcruise 0 errors; info: the DB CHECK on maxTokens is `> 0`, and the upper bound is in the validator (as specced) |
| Intelligence | PASS | |
| Security | WARN | pre-existing moderate `sprintf-js` advisory (build-time, no fix upstream; debt ledger DEP-CVE-SPRINTFJS-PRECISION-001); gitleaks and semgrep clean |
| Quality | WARN | Lighthouse NEEDS_HUMAN only |

**Consensus**: WARN. Verdict files are in `matop/stoa-verdicts/`.

## Compliance Check Results

/compliance-check PG-199 (2026-10-19):

| Section | Status | Details |
|---|---|---|
| 2 Source of truth | PASS | CSV row In Progress, 90%; artifact path corrected (R1) |
| 3 Tests, typecheck, lint | PASS | full matrix (see Validation Commands) |
| 4 Plan deliverables | PASS | 122/124 plan boxes; the 2 open are Lighthouse and the ADR-082 flip, which depends on it |
| 5 Context acknowledgement | PASS | attestations/PG-199/context_ack.json |
| 6 CSV artifacts vs plan | PASS | all 5 CSV artifacts in the plan and on disk (validate-artifacts reports a structural MISMATCH) |
| 6b Attestation forensics / schema | PASS | validate-schemas: attestation.json valid; provenance check exit 0 |
| 6c Attestation phrases (Guards 6, 8) | PASS | check-attestation-phrases: OK |
| 7 Mock coverage | PASS | page tests mock only tRPC, auth and the Radix Select; real PageHeader and domain |
| 9 Architecture | PASS | architecture tests 40/40; depcruise 0 errors (Domain STOA) |
| 10 PRD/ADR governance | PASS | PRD addendum and delivery note; ADR-082 Proposed (flip blocked by Lighthouse) |
| 11 Accessibility doc gate | PASS | WCAG statement 1.11.0 and VPAT 1.12.0 entries added; route already in scope (92) |
| 12 Navigation wiring | PASS | check-nav-wiring exit 0; sidebar + AI settings panel |
| 13 Lighthouse evidence (Guard 9) | **BLOCK** | met:false with no human approver: the NEEDS_HUMAN item |

**Compliance verdict**: NEEDS_HUMAN (Section 13 only).

## NEEDS_HUMAN

1. **Lighthouse (AC-028, CSV GATE).**
   - Path A was unauthenticated: performance 93, accessibility 90, best-practices 93, SEO 66. It measured the auth-pending shell, not the page.
   - Path C needs `LHCI_TEST_EMAIL` / `LHCI_TEST_PASSWORD` for a non-production Supabase. None exists locally (checked), and logging in against production is not allowed.
   - Details are in `artifacts/lighthouse/PG-199/README.md`. ADR-082 stays Proposed until this passes.
2. **Production migrations (Class A).** `20261019120000_tenant_model_config` and `20261019120100_tenant_ai_config_rls` must be applied with `prisma migrate deploy` before the API is promoted. The production RLS state is unknown; projects-64 verifies it at rehearsal.

## Ship phase (2026-10-19, after Aurora's SHIP instruction)

- Merged origin/main (#920, #922, #923, #930) without conflicts. The integration test adopts the #930 schema lock. api 7962, ai-worker and adapters 2993 re-run green after the merge.
- Pre-ship run 1 failed at lint-promises (`void` not accepted), which is fixed. Run 2 and later failed only at codex-review, whose new findings were all real and all fixed with RED/GREEN logs:
  - Ollama calls billed at alias prices
  - the spend cache: concurrent reads, a stale overwrite, then a double count (fixed as a monotonic max of read, cached and persisted totals)
  - LiteLLM gateway fallbacks metered at the free price: owner ruling **Q9 = B, fix now**; priced from the served model, parity-tested against infra/litellm/config.yaml
  - getNextBestActions without the tenant
  - edits lost while a save was pending
- Codex round 11: PASS, 0 findings. The final pre-ship result and the PR are in the READY message to Aurora.

## Review round 1 (Aurora, PR #935)

- **P1:** the cost-tracker usage history was unbounded, and an OOM risk once every call is metered. It is now capped at 1000 records (164b6c6ba).
- **P2a:** a metering failure, such as the daily cost limit check throwing, failed a paid, successful call. It is now logged as usage_not_metered (3eb5f3936).
- **P2b:** NBA answered a ceiling refusal with heuristics. It now rethrows (f50b383ff).
- RED: `logs/40-aurora-r1-red.txt`; GREEN: `logs/40-aurora-r1-green.txt`. The full ai-worker suite passes (2382).
- Accepted with no change, and noted in the PR body: `get` is open to readers, the audit write is best-effort after commit, and tasks with no tenant skip the ceiling. The PR body also asks projects-64 to pre-count CHECK violators before VALIDATE.
- Pre-ship at 94c3541de (after the codex quota reset) passed 31 of 34 steps and failed codex-review with one real finding: a batch embed with a failed sibling request recorded no spend for the requests that succeeded and were billed. Each Gemini and OpenAI-compatible embedding request is now metered on its own (2da1c0c62). RED: `logs/42-codex-r-red.txt`; GREEN: `logs/42-codex-r-green.txt`; the full ai-worker suite passes (2385, `logs/42-codex-r-suite.txt`).
- Pre-ship at 7f6c31ea2 failed codex-review with one real finding: with metering failures logged (P2a), the daily cost limit was no longer enforced. The limit is now checked before each metered chat and embedding call, so the call after the limit is refused before the provider, and the paid call that crossed it keeps its answer (230f120c6). RED: `logs/44-codex-dl-red.txt`; GREEN: `logs/44-codex-dl-green.txt`; the full ai-worker suite passes (2390, `logs/44-codex-dl-suite.txt`).
- Pre-ship at 9c2e4d9ff failed codex-review with two real findings. (1) A tool-call response with no provider usage recorded zero output tokens; the estimate now counts the generated calls (00d676633). (2) The locked rag card showed the LiteLLM default embedding model while production runs Gemini: owner ruling **Q10 = the worker publishes it**. The ai-worker writes the embedding model it runs to Redis, the API reads it, and the card shows it or "unavailable" (b0f4a65be). RED/GREEN logs `logs/46-codex-*.txt`.
- Merged origin/main (#934) with one generated-file conflict (artifacts/benchmarks/baseline.json, main taken); migrations 20261019120000/120100 kept. After the merge: typecheck passes, api 7968, ai-worker 2397, web agent-approvals 159 (`logs/47-merge-*.txt`).

## Follow-up issues

- #924 ChainVersion.model unused
- #925 ChainVersionEditor resets parameters
- #926 Approval Policies missing from settings search
- #927 RLS enabled without a policy on two tables
- #928 sentiment rate-limit purpose
- #929 shared Slider thumb unlabelled
- #905 (existing) `scripts/test-db.mjs` sink recursion

## Task Status

**Status Change**: Plan Complete → In Progress (90%, NEEDS_HUMAN). The runner pushes, runs pre-ship and opens the PR.
