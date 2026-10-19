# PG-199 out-of-scope findings (filed as issues in Step 30)

| # | Finding | file:line | Proposed fix | Found |
|---|---|---|---|---|
| F1 | `ChainVersion.model` is stored and editable but never used at runtime (chains use only `config.prompt`) | `packages/db/prisma/schema.prisma` ChainVersion.model; `apps/ai-worker/src/chains/scoring.chain.ts:147-166` | Either drop the field from the editor or route it through the model catalog | spec exploration |
| F2 | ChainVersionEditor resets temperature/maxTokens to hard-coded defaults on edit (silent data loss) | `apps/web/src/components/ai-agents/ai-settings/ChainVersionEditor.tsx:68-85` | Carry temperature/maxTokens in `ChainVersionSummary` and seed the edit form from it | spec exploration |
| F3 | Approval Policies page missing from settings search | `apps/web/src/lib/shared/settings-search.ts` | Add an entry + bump the count test | spec R3 |
| F4 | `tenant_tool_enablement` / `tenant_memory_policy` have RLS enabled without any policy | creation migrations | Add tenant isolation policies (case_types shape) | spec exploration |
| F5 | sentiment chain resolves its rate limit with purpose `scoring` while its model uses `structured` | `apps/ai-worker/src/chains/sentiment.chain.ts:341` | Use `structured` | spec exploration |
| F6 | `pnpm test:db:run/up/down` always crash with "Maximum call stack size exceeded" after provisioning, leaking the ephemeral DB: the default `io.stderr`/`io.stdout` call themselves | `scripts/test-db.mjs:96-97` | `stderr: (t) => process.stderr.write(t)`, `stdout: (t) => process.stdout.write(t)` + a CLI test without overrides | exec Step 6 (2026-10-19) |
| F7 | Shared `Slider` passes `aria-label` to the Radix root, not the `role="slider"` thumb, so every slider has no accessible name (axe `aria-input-field-name`) | `packages/ui/src/components/slider.tsx:5-20`; consumer `apps/web/src/components/ai-review/ReviewQueue.tsx:305-312` | Forward `aria-label`/`aria-labelledby` to `SliderPrimitive.Thumb` + an axe test | exec Step 25 (2026-10-19) |
