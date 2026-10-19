# PG-199 — owner rulings

## Inherited (PG-198 owner ruling, 2026-10-13 — do not re-ask)

- **R1 API location:** `apps/api/src/modules/agent/model-config.router.ts`, mounted in
  `apps/api/src/router.ts` beside `approvalPolicies`. Not `modules/agent-approval/`; update the
  CSV ARTIFACT path accordingly (CSV only, then split-sprint-plan).
- **R2 Never-downgrade:** allow-listed models may be picked; picking an older/smaller/cheaper model
  than the current one needs a confirm dialog plus an audit-log entry naming the actor.

## Given 2026-10-19T11:21:00Z by Talysson in this lane's AskUserQuestion modal

| # | Question | Answer |
|---|----------|--------|
| Q1 | What is one row ("agent" in "per-agent")? | **A. Per purpose** — the 6 `LLMPurpose` values (scoring, qualification, email, reasoning, structured, rag), the existing `TenantAIConfig` key. |
| Q2 | Cost ceiling reached? | **A. Block that purpose** — monthly USD ceiling per purpose; once reached that purpose's AI calls stop and the existing non-AI fallbacks run; other purposes keep working. Requires new per-purpose spend tracking. |
| Q3 | Agents + conversation-summary job ignore tenant settings (hardcoded free tier) — fix in this PR? | **A. Yes, wire them now** — `base.agent.ts` and `summarize-conversation.job.ts` move to the tenant-aware factory. |
| Q4 | Fallback entry cheaper/older than primary — confirm? | **A. Yes, same confirm** — any pick of a lower-ranked model, primary or fallback, needs the confirm dialog + an audit entry naming the actor. |

Options as shown to the owner (recommended first in each): Q1 A purpose / B agent class / C PG-198
tool key; Q2 A block / B alert only / C drop to cheaper model (rejected: conflicts with
Never-Downgrade); Q3 A wire now / B follow-up row; Q4 A same confirm / B fallbacks exempt.

## Runner (Aurora) constraints relayed 2026-10-19 (after the owner modal)

- Migration ts 20261019120000 and ADR-082 confirmed. `base.agent.ts` and
  `summarize-conversation.job.ts` are clear of projects-64's lane.
- PG-199 OWNS the `tenant_ai_config` RLS policy (projects-64 confirmed no RLS work there). Keep it
  in a separately removable step. Shape: follow `20261013120000_case_types` — ENABLE ROW LEVEL
  SECURITY, NOT FORCE; CREATE POLICY inside `DO $$ ... EXCEPTION WHEN duplicate_object` guard.
  Header must state prod RLS state: "unknown, projects-64 verifies at rehearsal" (no prod query).
  No code path may depend on the policy filtering rows — tenant scoping stays in the queries.
- CI test DB uses db:push (skips RLS/CHECKs): integration tests apply the SQL themselves or do not
  depend on it.
- Deploy skew: web deploys before API promote → page must degrade calmly on tRPC NOT_FOUND and
  must not send fields the old API rejects.
- Per-purpose blocking must not stop agents while the spend table/columns are empty or missing:
  fail open to "no ceiling" only until the migration is applied, and log the reason.

## Given 2026-10-19T11:25:20Z by Talysson (second modal, raised by Round 1 Domain-Expert)

| # | Question | Answer |
|---|----------|--------|
| Q5 | `rag` is embeddings; changing its model changes vector size (768 vs 1536). Row behaviour? | **A. Show it, model locked** — rag row visible, current model read-only; only the cost ceiling is editable. |
| Q6 | `email` has no non-AI fallback; at ceiling drafts stop. How shown? | **A. Visible 'ceiling reached'** — auto-response returns a clear "monthly AI ceiling reached for email" error; the page shows the purpose as blocked; other purposes keep working. |

Lead decisions (technical, not owner): ceiling stored as integer cents (matches
`aiSpendCentsPerMonth`), UI shows USD; spend misattribution (`base.agent.ts:690` hardcoded
`-free`, `insight-generation.chain.ts:362-367` 0/0 tokens) is fixed in this PR because
per-purpose ceilings cannot be correct without it.

## Given 2026-10-19T11:30:12Z by Talysson (third modal, raised by Round 2 Domain-Expert)

| # | Question | Answer |
|---|----------|--------|
| Q7 | Never-Downgrade ranking: hand-assigned capability ranks (llama-3.1-8b 20 … claude-sonnet-4-5 85) or price? | **B. Rank by price** — order follows `MODEL_PRICING`; owner accepted the stated consequence that free models (gpt-oss-20b) rank lowest and llama-3.3-70b outranks gpt-4o-mini. Hand-assigned capability ranks REJECTED. |
| Q8 | rag embeddings are not metered per tenant; what should the rag ceiling do? | **A. Meter embeddings now** — embedding calls become tenant-aware and their spend is counted per tenant under `rag`, so the rag ceiling really blocks. |

Lead interpretation of Q7 (technical): rank = blended price per 1k tokens = input + output USD
per 1k as in `MODEL_PRICING` (`apps/ai-worker/src/config/ai.config.ts:198-269`), carried into the
domain catalog with a parity test. A pick is a downgrade iff its price is strictly lower than the
current effective model's; equal price is a lateral move (no confirm, still audited). Unknown /
retired current model ⇒ treat as downgrade (safe toward confirm). Embedding models are ranked only
against embedding models (rag model stays locked per Q5, so this only matters for the catalog).

## Ship-time ruling (2026-10-19, AskUserQuestion during SHIP)

| # | Question | Answer |
|---|----------|--------|
| Q9 | Codex (pre-ship) found LiteLLM gateway fallbacks (reasoning-free -> reasoning-standard, structured-free -> structured-standard) are metered at the free alias price, so purpose ceilings undercount. Waive + issue, fix now, or remove the gateway fallbacks? | **B. Fix now** - price each chat call from the model the gateway reports serving (response_metadata.model_name mapped to MODEL_PRICING via a table parity-tested against infra/litellm/config.yaml); construction metadata only when the response names no known model. |
