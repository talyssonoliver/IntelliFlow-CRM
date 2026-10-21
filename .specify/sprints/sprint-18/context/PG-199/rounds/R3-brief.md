# PG-199 Round 3 CHALLENGE — brief from the lead

Read ALL six R2-*.md files and PG-199-owner-ruling.md (now Q1–Q8). Write your challenge to
rounds/R3-<your-role>.md (only file you may create/edit), file:line citations required.

## Settled since Round 2 (do not re-propose; challenge only with code evidence)

- **Q7 (owner): rank BY PRICE, not hand-assigned capability ranks.** rank = input+output USD per 1k
  from MODEL_PRICING; strictly lower price ⇒ downgrade; equal ⇒ lateral (no confirm, audited);
  unknown/retired current ⇒ treat as downgrade. Domain-Expert's 0-100 rank table is REJECTED.
- **Q8 (owner): meter embeddings now** — embeddings become tenant-aware and count spend under `rag`;
  rag ceiling really blocks (rag model still locked per Q5).
- Save contract: ONE atomic mutation `modelConfig.update({ purposes: PurposeConfigInput[],
  acknowledgeDowngrade?: true, expectedUpdatedAt? })` covering all edited purposes in one
  `$transaction` (page-level Save). The validator's superRefine rejects duplicate purposes
  (this is the DoD "duplicate agent keys" item). Plus `get` and `resetToDefaults`.
- Optimistic concurrency: `expectedUpdatedAt` (tenant's latest row updatedAt) ⇒ CONFLICT on mismatch;
  web hasConflict disables Save (playbook §3).
- Spend: Backend's `PurposeSpendPort` (not the closed QuotaKey) over tenant_usage_counters key
  `aiSpendCents:<purpose>`, period YYYY-MM UTC. EVERY tenant-aware LLM/embedding call is metered with
  its purpose (in the factory, not per caller), so qualification/email ceilings can trip.
- Fail-open: only "relation/column does not exist" (pre-migration skew) ⇒ no ceiling + warn log with
  reason; other DB errors ⇒ last cached value, else fail open + warn log (matches the existing
  tenant-ai-config fail-open). Never block AI because the DB is unreachable.
- Server enforces downgrade + rag lock; the web calls the same domain `findDowngrades` for its
  confirm.

## Challenge sections
- Challenges (what could go wrong, with code evidence)
- Edge cases (month rollover, purpose with no row, pinned model retired from catalog, provider
  without the pinned model e.g. Ollama/OpenRouter, fallback loops, concurrency, 60 s cache)
- Integration issues (cite both files)
- Dead-on-arrival risk (any proposed file/procedure/function with no production caller)
- UI reachability (sidebar/breadcrumbs/settings search) and route conflict (AI Settings chain
  versions)
- Suggestions (concrete fixes)
Under 800 words.
