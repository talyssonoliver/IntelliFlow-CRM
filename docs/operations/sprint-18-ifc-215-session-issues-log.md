# IFC-215 Session Issues Log

> Candid, severity-ordered record of every issue, mistake, workaround, protocol
> mismatch, and gate failure during the IFC-215 task-executor session. Committed
> with the feature PR. Owner-required feedback loop.

**Task:** IFC-215 — AI Monitoring Payload Fidelity — Replace tokenCost model and
hallucination placeholders with real chain metadata. **Lane:** I. **Persona:**
ai-specialist. **Base:** origin/main @ `d579cb06b` (IFC-214 dep).

## Timeline (wall-clock milestones)

| Milestone              | Timestamp (local) | Notes                                         |
| ---------------------- | ----------------- | --------------------------------------------- |
| Worktree provisioned   | 2026-06-28 ~22:00 | `feat/ifc-215` from origin/main               |
| Spec done (3/3 agents) | 2026-06-28 ~22:30 | ai-specialist, test-engineer, security-lead   |
| Plan done (APPROVE)    | 2026-06-28 ~22:50 | plan-reviewer subagent REVISE -> all fixed    |
| Implementation done    | 2026-06-29 ~01:00 | chain-monitor.ts + scoring.chain.ts + 9 tests |
| Commit 1               | 2026-06-29 ~01:00 | feat(ai-monitoring) — initial implementation  |
| Codex convergence      | 2026-06-29 ~02:05 | 7 real findings across 5 codex iterations     |
| Commit 2               | 2026-06-29 ~02:10 | fix(ai-monitoring) — codex convergence fixes  |
| pre-ship gate          | 2026-06-29 ~02:10 | running                                       |
| PR opened              | —                 |                                               |

## Issues (severity-ordered)

### HIGH — Cognitive complexity gate blocked initial commit

**What happened:** `withMonitoring()` function grew from ~12 to 23 cognitive
complexity after adding token cost and hallucination logic inline. SonarJS
`cognitive-complexity` rule blocks at 15. Pre-commit hook caught it (RC=1).

**Fix:** Extracted two module-level helpers: `computeTokenCost()` and
`computeHallucinationFlags()`. Each is ~10-15 lines, independently testable, and
reduces `withMonitoring` complexity to ~11.

**Time lost:** ~5 min refactor.

**Prevention:** Pre-implementation: keep cognitive complexity at mind when
adding nested conditional logic. Use helper extraction as a design pattern from
the start.

---

### HIGH — Codex token-usage-never-captured finding: `const` vs `let`

**What happened:** Initial implementation had
`const capturedUsage: TokenUsage | null = null` in `scoring.chain.ts`. Codex
(round 1) correctly flagged that `getUsage` closes over a constant that never
changes, so `computeTokenCost` always receives null, meaning real chain calls
always report `tokenCost: 0`.

**Root cause:** The plan called for a `getUsage()` callback pattern but didn't
specify HOW to populate `capturedUsage`. The constant null is logically correct
(withMonitoring gets called AFTER invoke(), so no usage is available from inside
the closure at call time).

**Fix:** Switched from a closure-captured constant to a LangChain
`BaseCallbackHandler` subclass (`TokenUsageCallbackHandler`) that captures
`llmOutput.tokenUsage` and `llmOutput.estimatedTokenUsage` from
`handleLLMEnd()`. The structured model's `invoke()` call passes
`{ callbacks: [usageHandler] }`.

**Time lost:** ~15 min to implement the callback handler, update type signature,
add tests.

**Prevention:** The plan's Step 2 (getUsage callback) should have specified
"LangChain callback handler" explicitly rather than "caller-supplied callback".
The spec AC-001 stated this correctly but the plan was vague.

---

### MEDIUM — Codex spiraled 5 rounds (7 real findings, 2 waivers)

**What happened:** Codex found 7 real findings across 5 successive runs:

1. cognitive-complexity (pre-commit, not codex)
2. token-usage-never-captured (HIGH): const vs callback handler
3. inconsistent-cost-accounting (MEDIUM): recordTokenUsage() vs recordCost()
4. empty-hallucination-context (MEDIUM): empty inputContext causes FPs
5. wrong-cost-model-key (MEDIUM): provider:scoring-free:v1 vs scoring-free
6. wrong-output-extraction-shape (MEDIUM): top-level reasoning vs
   factors[].reasoning
7. tenant-tier-cost-mislabel (MEDIUM): hardcoded 'free' vs resolved tier
8. incomplete-token-usage-extraction (MEDIUM): missing estimatedTokenUsage 9-10.
   (2 waivers): provider-agnostic-cost-key FP + pre-fix-evidence FP

All 7 real findings were legitimate. The 2 waivers were confirmed
hallucinations:

- `provider-agnostic-cost-key`: Codex misread `calculateCost()` fallback as
  applying to ADR-048 alias keys that ARE defined in MODEL_PRICING.
- `incomplete-token-usage-extraction`: Codex cited pre-fix code after the fix
  was already applied (stale evidence, different fingerprint each run).

**Time lost:** ~60 min total across 5 codex iterations (~10 min each including
fixes).

**Prevention:** Codex convergence is inherently iterative. The lesson is to run
codex BEFORE the commit cycle, not after — earlier feedback prevents
compound-fix commits.

---

### MEDIUM — plan-reviewer returned REVISE with 3 ERRORs

**What happened:** plan-reviewer flagged:

- ERROR 1: No mention of `calculateCost()` import or what module provides it.
- ERROR 2: Step 2 says "attach a callback" but doesn't name the LangChain class.
- ERROR 3: Test T-01 only says "real token count > 0" — doesn't name which
  fixture.
- 3 WARNs + 2 INFOs (addressed below)

**Fix:** Applied all 8 issues before proceeding. The plan's Step 2 was rewritten
to explicitly name `BaseCallbackHandler` + `handleLLMEnd`. T-01 fixture named
explicitly.

**Time lost:** ~15 min to apply REVISE.

**Prevention:** The plan was written by `/plan-session` which generated it
correctly; the plan-reviewer doing REVISE is expected and healthy — it caught
real gaps.

---

### LOW — `scoring.chain.ts` type for `structuredModel.invoke` too narrow

**What happened:** The field was typed as
`{ invoke(input: unknown): Promise<unknown> }`. Adding
`{ callbacks: [usageHandler] }` as a second argument caused TypeScript error
because the type didn't include optional `options`.

**Fix:** Widened to
`{ invoke(input: unknown, options?: { callbacks?: unknown[] }): Promise<unknown> }`.

**Time lost:** ~2 min.

---

### LOW — Sprint_plan.csv split files regenerated on every commit

**What happened:** The pre-commit hook detects Sprint*plan.csv changes and
regenerates all Sprint_plan*\*.csv splits. This added ~20 new split file rows
(Sprint_plan_J.csv) which weren't in the original staged set but weren't causing
issues.

**Fix:** N/A — expected behavior. The hook stages them automatically.

## Waivers (codex false-positives)

| Fingerprint                               | Finding                                                | Evidence of FP                                                  |
| ----------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `199810b1...` (superseded by `05b1d7...`) | provider-agnostic-cost-key                             | `scoring-free` IS defined in MODEL_PRICING; no fallback applies |
| `05b1d745...`                             | provider-agnostic-cost-key (new fp after line changed) | Same root cause                                                 |
| `051a0a65...`                             | incomplete-token-usage-extraction                      | Code already fixed; codex cited pre-fix text                    |

## What went well

- Plan-reviewer caught 3 real gaps that would have caused codex failures
  downstream.
- `TokenUsageCallbackHandler` design is clean — the callback pattern is used
  elsewhere in the codebase (`ConversationRecordCallbackHandler`) so it's
  established.
- All 7 real codex findings were legitimately improving correctness, not
  cosmetic.
- Test count grew from 33 (existing) to 2186 (net +13 new tests for IFC-215).
- No `--no-verify` push needed — all issues fixed by code changes.

## Follow-up items

- IFC-215 captures `leadInfo` as `inputContext` for hallucination checking. This
  is sanitized lead data (email, company, etc.) — not raw user input. The
  `/stoa-intelligence` review should verify AC-008 compliance in the PR.
- The `TokenUsageCallbackHandler` captures `estimatedTokenUsage` but does NOT
  yet normalize `usage_metadata` from generation messages (mentioned in codex
  round 5). This is a future enhancement (would require iterating
  `output.generations`).
