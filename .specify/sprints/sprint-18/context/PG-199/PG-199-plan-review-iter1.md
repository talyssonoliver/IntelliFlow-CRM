## Plan Review: PG-199

### Verdict: REVISE (7 ERROR, 10 WARN, 5 INFO)

Spec read first (`PG-199-spec.md`), then the plan, then the Sprint_plan.csv row. Cited paths were checked on disk
(all existing paths found; `apps/web/src/lib/trpc-errors.ts` is correctly a Create).

### Category verdict table (A-II)

| Cat | Name | Result |
|---|---|---|
| A | Files summary accuracy | FAIL (E1) |
| B | AC traceability | FAIL (E4, E5) |
| C | Test file completeness | PASS (all spec test files have steps and summary rows) |
| D | Test case coverage | WARN (W4) |
| E | Spec value consistency | PASS (duplicate message/path, bounds, ceiling 0-2,000,000 match) |
| F | Accessibility | PASS (slider label + value, reorder buttons, aria-live, focus restore all in Step 24) |
| G | Type/interface location | FAIL (E3, E7) |
| H | Dependency availability | WARN (W3) |
| I | Hook/utility coverage | PASS |
| J | CSV artifact alignment | PASS with INFO (I1) |
| K | Effort estimates | FAIL (E2) |
| L | Design mockup verification | N/A: spec cites no mockup and `docs/design/mockups` has none for model config (I2) |
| M | NF in validation step | PASS (NF-001..005 in Steps 24/25/31/32) |
| N | Dependency chain update | PASS (Step 29: both chain files) |
| O | Backend prerequisites | PASS (API built in the same task; deps verified) |
| P | Shared component existence | WARN (W5) |
| Q | Risk mitigation | PASS |
| R | Layer order | PASS (domain, validators, db, port/adapters, api, worker, web) |
| S | Integration checkpoints | WARN (W7) |
| T | Plan structure | PASS (plural block format, `- [ ]` checkboxes) |
| U | Coverage targets | PASS (spec defines only diff-coverage >= 80% and package thresholds) |
| V | Test count arithmetic | PASS (plan states no test totals) |
| W | Spec integration points | WARN (W6) |
| X | Internal vs shared | WARN (W5) |
| Y | UI Reachability | PASS. Evidence: sidebar `apps/web/src/components/sidebar/configs/agent-approvals.ts:194-199` (`AI_SETTINGS_ITEMS` id `model-config`, href `/agent-approvals/model-config`, verified on disk) and parent link `apps/web/src/components/ai-agents/AIModuleSettingsPanel.tsx:17-21` (verified). Page already exists; no nav step needed, no waiver used. |
| Z | Internal contradictions | FAIL (E3, E7); WARN (W8) |
| AA | Type contract across boundaries | PASS (web consumes `modelConfig.*` via tRPC inference; no hand-written parallel type) |
| BB | PRD/ADR existence | PASS. PRD `docs/planning/prd-module-settings.md` exists (addendum at L1051), ADR-082 exists (Proposed), README row 270 exists; plan Step 29 updates all three. See W10 (ADR-048). |
| CC | Page doc co-change | PASS. `page.tsx` is a Modify (stub exists), but PAGE_MAP (Step 28, L320 verified), sitemap (L239/449 verified), nav-audit (L184 verified), page-registry, sitemap-reconciliation test are all covered. |
| DD | Exhaustive vs sampling | PASS (no sampling language) |
| EE | Duplicate detection | PASS (trpc-errors extraction removes 3 copies; no basename collision found for new files) |
| FF | Import chain | FAIL (E6, E7) |
| GG | Runtime wiring | FAIL (E6) |
| HH | Icon library | PASS; INFO I4 |
| II | Empty-state pattern | PASS (`entity="rules"`/`"agents"`, `phase="passive"` are valid entities) |

### Traceability Matrix

| AC/NF | Plan Step | Test | Status |
|---|---|---|---|
| AC-001 | 9, 24, 25 | router get; page/Content tests | COVERED |
| AC-002 | 3, 24, 25 | validators bounds; card edit | COVERED |
| AC-003 | 3, 9, 24 | rag lock | COVERED |
| AC-004 | 1, 9, 24 | downgrade, combined dialog | COVERED |
| AC-005 | 1, 9, 24 | lateral, audit | COVERED |
| AC-006 | 9, 24 | FORBIDDEN it.each, view-only | COVERED |
| AC-007 | 5, 9 | cross-tenant negative | COVERED |
| AC-008 | 9, 24, 31 | lock, expected, P2002, failTx, no skipDuplicates grep | COVERED |
| AC-009 | 3 | duplicate purposes | COVERED |
| AC-010 | 3, 9, 24 | no-op skip, tier null, no tier in payload | COVERED |
| AC-011 | 9, 24 | reset keeps rate limit, reset confirm | COVERED |
| AC-012 | 24 | NOT_FOUND role=status | COVERED |
| AC-013 | 11, 13 | pin per provider | COVERED |
| AC-014 | 13 | fallback chain, structured output | COVERED |
| AC-015 | 13, 17 (summary digest only) | per-purpose non-AI fallbacks mostly untested | PARTIAL (E4) |
| AC-016 | 9, 19, 21, 24 | rethrow, message, blocked badge | COVERED, Step 21 vague (E3) |
| AC-017 | 19, 20 | delayed re-queue, rag marker | COVERED |
| AC-018 | 7, 15, 16 | single metering, recorders removed | COVERED |
| AC-019 | 17, 18 | getModel with tenant, summary job | COVERED |
| AC-020 | 13 | P2021/P2022, outage matrix | COVERED |
| AC-021 | 5, 6 | CHECKs, RLS | COVERED |
| AC-022 | 26 | count 13 to 14 | COVERED |
| AC-023 | 30 (issues only) | header link to AI Settings: no step, no test | PARTIAL (E5) |
| AC-024 | 1, 11, 12 | parity tests | COVERED |
| AC-025 | 27, 28, 29 | reconciliation tests | COVERED |
| AC-026 | 29 | validate-artifacts | COVERED |
| AC-027 | 29 | chains | COVERED |
| AC-028 | 32 | Lighthouse or NEEDS_HUMAN | COVERED |
| NF-001 | 24, 32 | a11y tests + a11y-expert | COVERED |
| NF-002 | 25 | bundle check | COVERED |
| NF-003 | 31 | duplication, S2871 | COVERED |
| NF-004 | 32 | diff coverage; logic extraction not planned | COVERED, see W6 |
| NF-005 | 5, 31 | secret-shape scan | COVERED |

### Issues Found

| # | Cat | Severity | Issue | Fix |
|---|---|---|---|---|
| E1 | A | ERROR | Files Summary "Modify - ai-worker src" says 20 but Steps 12/14/16/18/20 enumerate 19 unique files (llm-factory, ai.config, tenant-ai-config, llm-tracer, tenant-ai-spend, cost-tracker, ai-worker.ts, base.agent, insight-generation.chain, 4 agents, summarize job, contact-embed-worker, ingestion-workers, embedding.chain, rag-context.chain, auto-response.chain). All other rows reconcile (Create 31 = 6+2+2+1+3+2+3+12 OK). | Correct row to 19, Modify total to 67, Grand total to 98 (or add the missing 20th file if one was intended, e.g. the Q6 file once named, E3). |
| E2 | K | ERROR | Estimated Effort table totals "~68 files" and per-phase counts (e.g. API 7 vs 6 actual, ai-worker ~22 vs 3 create + 19 src + 16 tests = 38, web ~14 vs 18, application/adapters 3 vs 5, docs ~12 vs 14) do not match the Files Summary (98/99). Phase hour ranges do sum to 14-23 h. | Recompute per-phase file counts from the steps and make the total equal the corrected Files Summary grand total. |
| E3 | G, Z | ERROR | Step 21 ("API mapping of email ceiling") names no file ("located in exec by grep") yet the summary counts 2 files for it, and the step carries a STOP clause if the file is `autoresponse.router.ts`. The chain is in the worker (`apps/ai-worker/src/chains/auto-response.chain.ts`); the API-side consumers are `apps/api/src/modules/autoresponse/*`. The implementer must guess. | Grep now (`PURPOSE_CEILING_REACHED` consumers and who reports draft failures to the UI), name the exact source and test files in Step 21 and the summary, or if no non-overlap file exists, fold the message mapping into Step 20 (`auto-response.chain.ts`, already listed) and drop the 2 rows. |
| E4 | B (AC-015) | ERROR | AC-015 requires non-AI fallbacks per purpose when the ceiling is reached: scoring default score/churn heuristic, qualification `source:'fallback'`, reasoning insight heuristic + summary digest, structured keyword routing/neutral sentiment. Plan only tests the summary digest (Step 17) and the auto-response rethrow (Step 19). The chains (`scoring.chain.ts`, `churn-risk.chain.ts`, `insight-generation.chain.ts`, `ticket-routing.chain.ts`, `sentiment.chain.ts`, `qualification.agent.ts`) have generic `catch` paths whose behaviour with the new coded error is unverified. | Add RED/GREEN validation items (Steps 13/17/19) asserting each listed purpose degrades to its non-AI fallback on `PURPOSE_CEILING_REACHED`, and add any chain/job files that need a change to the Modify lists and summary. |
| E5 | B (AC-023) | ERROR | AC-023 "Header links to AI Settings" has no implementation bullet in Step 25 and no test in Step 24; Step 30 only covers the filed issues half. | Add a Step 24 test (header contains link to `/agent-approvals/ai-settings`) and a Step 25 implementation checkbox. |
| E6 | GG, FF | ERROR | Wiring gap: `assertWithinCeiling` (Step 14, `purpose-ceiling.ts`) must read spend, and the tracer (Step 16) must write it, but only Step 16 instantiates `PrismaPurposeSpendRepository` in `ai-worker.ts`. The plan states no seam (setter/registry) by which `purpose-ceiling.ts` obtains that instance, and Step 14 precedes Step 16. A ceiling check with no reader silently fails open (AC-020), so the feature would ship unenforced with green tests. | In Step 13 add a test that the production boot path registers the spend reader (e.g. `setPurposeSpendReader` called from `ai-worker.ts`), in Step 14 define the seam, and in Step 16 add the registration call and a test that `createLLMForTenant` blocks via the registered reader. |
| E7 | Z, FF | ERROR | Spec says `CALLER_DEFAULT_TIERS[purpose]` is an "exported constant that callers import"; Step 11 repeats "callers import the exported constant" but no plan step modifies any of the ~21 caller files. Either the plan is wrong (callers unchanged, constant used only by resolver/`findDowngrades`) or ~10-15 caller files are missing from the Modify lists and summary. | Decide and state it: if callers are unchanged, reword Step 11 (parity test scans call sites as the only enforcement); if they import it, list them in a step and in the summary. |
| W1 | C, D | WARN | Step 18 validation says all agent test files incl. `*.additional.test.ts`, `base.agent.plan-reflect.test.ts`, `crew.test.ts`, `next-best-action.agent.b11.test.ts` must pass, and Step 17 says "llm-factory mocks gain `createLLMForTenant`". `email-writer.agent.additional.test.ts`, `followup.agent.additional.test.ts`, `base.agent.plan-reflect.test.ts`, `__tests__/next-best-action.agent.b11.test.ts` import/mocks `llm-factory` and are not in any Modify list. | Add them to Step 17 Modify (and summary) or state "verified unchanged" with the run command. |
| W2 | C | WARN | `embedding.chain.methods.test.ts` and `embedding.chain.boot-safety.test.ts` mock `llm-factory` and are only re-run in Step 20; Step 20 changes `embedding.chain.ts` and the tracer wraps embeddings. | Add them to Step 19 RED list (or confirm unchanged). |
| W3 | H | WARN | Step 11 parses `infra/litellm/config.yaml` but no dependency preflight; `apps/ai-worker/package.json` declares neither `yaml` nor `js-yaml` (root has both). | Add a preflight line confirming resolution from ai-worker, or add the devDependency. |
| W4 | D | WARN | Spec UI behaviours with no Step 24 test: UTC period label + refetch on focus, the disclosure copy (changes apply within ~2 minutes, soft ceilings, embedding spend estimated, OpenRouter-unavailable marker), server issue paths mapped to fields, `EmptyState entity="rules"` for an empty fallback list. | Add checkboxes for each. |
| W5 | P, X | WARN | Spec lists shared composition (PageHeader, SectionHeader, Card, ConfirmationDialog, EmptyState, Select, Slider, Skeleton). Plan never names them or adds a preflight check. They exist (`@/components/shared/page-header`, `@/components/shared/section-header`, `@intelliflow/ui` per `ApprovalPoliciesContent.tsx:13-18`); `Slider`/`Select` in `@intelliflow/ui` not verified here. | Add reuse tags to Step 25 and a preflight existence check (incl. Slider). |
| W6 | W, NF-004 | WARN | Step 10 does not reference `assertAgentSettingsAdmin`, `isAgentSettingsAdmin`, `rethrowConflict` (all exist in `settings-shared.ts`), the advisory-lock pattern, or where `logModelConfigAudit` lives. NF-004 says logic must live outside coverage-excluded `router.ts`, yet the only API file created is the router. | Name the helpers in Step 10 and, if router logic is coverage-excluded, add a helper module (update summary) for the diff/audit/downgrade logic. |
| W7 | S | WARN | Checkpoints after Steps 20, 29, 32 point to "matrix row"/"docs + root rows" instead of an exact command; Step 21 has no checkpoint. | Inline the exact commands. |
| W8 | Z | WARN | Step 29 sets ADR-082 to Accepted ("after GREEN validation") before the Step 32 full-matrix gates run. | Move the ADR/README status flip to after Step 32 or state it is conditional and revertible. |
| W9 | B | WARN | CSV DoD items 4, 8, 9, 10 (TagsTab, colorToken CHECK, AI defaults FALSE, toggles) are declared N/A in the spec but not carried into the plan's Final Validation/attestation `definition_of_done_items`. | Add an explicit N/A-with-reason line per item in Step 32/Final Validation. |
| W10 | BB | WARN | Spec says ADR-082 amends ADR-048; ADR-048 (`docs/architecture/adr/ADR-048-hybrid-ai-inference.md`) is not in any Modify list. | Add an "Amended by ADR-082" note to Step 29 and summary, or state it is intentionally untouched. |
| I1 | J | INFO | Plan creates many files not in CSV ARTIFACT; CSV `FILE:` entries (sidebar config, AgentLogsViewer, playbook, PRD) are not in the alignment table. Only the router path needs the R1 fix (Step 29). | Optional: list them as reference-only. |
| I2 | L | INFO | No design mockup exists for this page; no verification step required. | None. |
| I3 | C | INFO | Spec says integration test runs with `DATABASE_TEST_URL` only; Step 5/preflight 6 use `.env.test` `DATABASE_URL`. | Align wording. |
| I4 | HH | INFO | New icons (reorder arrows, lock, block) already present in `artifacts/reports/material-symbols-glyph-audit.json` (`arrow_upward`, `arrow_downward`, `lock`, `block`, `psychology`, `info`, `warning`); no font regeneration needed unless others are used. | Add `node tools/scripts/subset-material-symbols.mjs --verify` to Step 25 as a guard. |
| I5 | TDD | INFO | Step 21 is GREEN-only (no RED step). | Resolved by E3 if folded into Step 19/20. |

### Severity Summary

- ERRORS: 7 (must fix before finalizing plan)
- WARNINGS: 10 (should fix, document if not)
- INFO: 5 (optional improvements)

### Files Summary Audit

- Plan says: 31 create, 68 modify (grand 99)
- Actual count: 31 create (matches), 67 modify (ai-worker src 19, not 20), grand 98
- Delta: -1 in "Modify - ai-worker src" (E1); Step 21 files are unnamed placeholders (E3); caller files (E7), chain fallbacks (E4), extra agent tests (W1/W2) and a router helper module (W6) may add files once resolved.

### Run Metrics (self-reported, indicative only)

- Started / finished (UTC): unknown / unknown (no clock tool used)
- Files read: 3 inputs in full plus ~12 targeted greps/listings; tool calls: 9 (+1 write)
- Model: claude-sonnet-5-5
