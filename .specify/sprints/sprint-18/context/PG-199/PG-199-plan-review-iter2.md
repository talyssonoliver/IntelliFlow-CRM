## Plan Review: PG-199 (iteration 2)

### Verdict: REVISE (3 ERROR, 3 WARN, 2 INFO)

All iter1 items were re-checked against the plan and disk. Resolved: E3 (Q6 now lives in the coded error, Step 19; `AutoResponseChain` confirmed to have no API importer), E4 (Step 21 added), E5 (Step 24/25 header link), E6 (seam tested in Steps 13/15, wired in Step 16, Reality Checks row 54), E7 (decision recorded in Step 11, and the spec was edited to match: `PG-199-spec.md:87`), W1-W10, I1-I4. Shared UI primitives in preflight 11 exist (`slider`, `select`, `confirmation-dialog`, `empty-state`, `skeleton`, `card`, `page-header`, `section-header`). The advisory-lock reference matches `scheduled-reports.router.ts:106-110`. New iter2 files exist (`ai-worker.tenant-ai-spend-wiring.test.ts`, `next-best-action.agent.b11.test.ts`, `case-ai-automation.job.test.ts`).

### Category results (A-II)

A FAIL (E1); B PASS (AC-001..028, NF-001..005 all mapped; AC-015 -> Step 21, AC-016 -> Step 19, AC-023 -> Steps 24/25); C PASS; D PASS; E PASS; F PASS; G PASS; H PASS (preflight 10); I PASS; J FAIL (E2: stale step refs); K FAIL (E1); L N/A (no mockup); M PASS; N PASS; O PASS; P PASS; Q PASS; R PASS; S FAIL (E3: one checkpoint command filters a nonexistent file); T WARN (W2); U PASS; V PASS; W PASS; X PASS; **Y PASS** (sidebar `agent-approvals.ts:194-199` + parent link `ai-agents/AIModuleSettingsPanel.tsx:17-21`, both verified; page pre-exists, no waiver); Z WARN (W1); AA PASS; **BB PASS** (PRD exists with addendum L1051; ADR-082 exists, flipped to Accepted in Step 32 after gates; README row 270 updated; ADR-048 amendment note in Step 29); CC PASS; DD PASS; EE PASS; FF PASS; GG PASS (seam registered at boot, tested); HH PASS (glyph verify in Step 25); II PASS.

### Traceability

All 28 AC and 5 NF are covered (see iter1 matrix; changes: AC-015 Step 21, AC-016 Step 19 exact message, AC-023 Steps 24/25, NF-004 Step 10 coverage note).

### Issues Found

| # | Cat | Severity | Issue | Fix |
|---|---|---|---|---|
| E1 | A, K | ERROR | "Modify - ai-worker tests" says 22 but Steps 13/15/17/19 enumerate 23 unique files: Step 13 = 3 (tenant-ai-config, createLLMForTenant, llm-factory); Step 15 = 4 (llm-tracer, tenant-ai-spend, cost-tracker, ai-worker.tenant-ai-spend-wiring); Step 17 = 10 (5 agent + 4 extra agent + summarize job); Step 19 = 6 (contact-embed, ingestion, rag-context, auto-response, 2 embedding chain). All other rows reconcile (Create 32; src 19; docs 15). | Set the row to 23, Modify total to 73, Grand total to 105; in the Effort table ai-worker modify 43 (46 -> 47 files) and Total 32 + 73 = 105. Update line 63 "same 104 files". |
| E2 | J | ERROR | Stale step references: plan header L8 says PG-199 chains are added "in Step 44" and L11 says ADR-082 Accepted "in Step 45" (plan has 32 steps; chains are Step 29, ADR flip is Step 32); Step 2 says catalog parity is "enforced in Step 26" (it is Step 11/12; Step 26 is settings-search). | Correct to Step 29, Step 32, Step 11. |
| E3 | S, C | ERROR | Step 21 and the checkpoint-21 command filter `src/contact-reply-draft.chain.test.ts`, which does not exist; the file is `apps/ai-worker/src/__tests__/contact-reply-draft.chain.test.ts`. Vitest with an unmatched filter silently runs nothing for that path. | Fix the path in Step 21 (validation bullet 4) and the Integration Checkpoints row 21. |
| W1 | Z | WARN | Step 21 maps "qualification" to `case-insight.chain.ts` (`source:'fallback'`). Qualification purpose callers are `agents/qualification.agent.ts` / qualification chains, not case insight; the spec's qualification fallback is not shown to be exercised. | Confirm which qualification call site carries `source:'fallback'` and use it (add case for `qualification.agent.ts` if it has a fallback path). |
| W2 | T | WARN | Step 29 "Files to Modify" contains a non-path bullet "(ADR-082 Status -> Accepted ... move to Step 32)"; list parsers (validation-summary) may read it as a file. | Move that sentence out of the file list into prose. |
| W3 | Z | WARN | Step 14 (GREEN) has no checkbox for implementing `setPurposeSpendReader`/`getPurposeSpendReader` and the `spend_reader_missing` once-log; they are only specified in the Step 13 test. | Add an implementation checkbox to Step 14. |
| I1 | S | INFO | Checkpoint 32 command is a procedure ("each Validation Matrix row") rather than one command; acceptable since the matrix lists exact commands. | None. |
| I2 | Step 21 | INFO | Conditional chain edits (0-7 files) are not in the Files Summary by design; the step names all candidates and requires reporting. | None. |

### Severity Summary

- ERRORS: 3 (must fix before finalizing plan)
- WARNINGS: 3
- INFO: 2

### Files Summary Audit

- Plan says: 32 create, 72 modify (104)
- Actual: 32 create (matches), 73 modify (ai-worker tests 23, not 22), grand 105
- Delta: -1 in "Modify - ai-worker tests"; Effort table follows the same off-by-one.

### Run Metrics (self-reported, indicative only)

- Started / finished (UTC): unknown / unknown
- Files read: plan in full, spec grep, ~12 path checks; tool calls: 5 (+1 write)
- Model: claude-sonnet-5-5
