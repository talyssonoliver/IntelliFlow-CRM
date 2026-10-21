APPROVED

# PG-199 Round 4 CONSENSUS (Frontend-Lead)

## Agreement
I support D1 to D4, D6 to D14 and D24 to D29 as written from the web lens, and take D15 to D23 as the owners' (ai-worker, API, data) calls. Points where my lens is directly exercised:
- **D25** matches my R3 challenge 1 (one combined confirm at Save, computed from `findDowngrades(snapshot, draft)`), and the changed-only payload from challenge 8.
- **D2 and D26:** price-only wording ("lower price") and the disabled "(retired)" option are what I asked for.
- **D10:** `retired`, `locked`, `spentCents|null`, `onOpenRouter` in `get` give the UI everything it needs to avoid claiming an unapplied pin. This replaces my requested `pinHonoured`.
- **D3:** because `get` returns EFFECTIVE config, a first save from defaults resolves through the table in the web as well, so the unknown-model rule does not fire spuriously.
- **D26 migration of the existing `errorCode` copies** is acceptable, with the caveat below.
- **D27:** adding the settings-search entry and bumping 13 to 14 is right.
- **D28:** N/A items are correct. There is no Boolean on the page, no tags card, and rows are keyed by purpose.

## Modifications (non-critical)
1. **D5 needs build work it does not mention.** `packages/domain/tsup.config.ts:4` builds `entry: ['src/index.ts']` only, so the existing `./crm/*` and `./shared/*` exports (`packages/domain/package.json:15-26`) point at files tsup never emits, and no code imports a domain subpath (grep found none outside `dist`). An `./ai/*` export alone would be dead. Meanwhile `apps/web/next.config.js:58-62` already lists `@intelliflow/domain` under `optimizePackageImports`, which handles barrel tree-shaking, and `ApprovalPoliciesContent.tsx:14` already imports a runtime constant from the root. So D5's own escape clause applies. Recommendation: keep the root import, and verify with a measured build (the 4-validation `pnpm build` output for the route's First Load JS). Only add the subpath if that measurement shows growth, in which case it must also add a tsup entry (for example `'ai/model-config/index'`) and check the vitest alias (`vitest.config.ts:31` maps the package root to `src`, so a subpath resolves in tests only).
2. **D26 migration of old copies:** `CaseTypesContent.tsx:27` and `ContactTypesContent.tsx:28` export `errorCode`, and their tests import it (`CaseTypesContent.test.tsx:95,346-351`, `ContactTypesContent.test.tsx:89,328-330`). Migrating must keep a re-export (or move those assertions to a `trpc-errors.test.ts`) so the existing tests do not break. `AvailabilityContent.tsx:60` is private. The three `errorMessage` copies have differing fallback strings (`ApprovalPoliciesContent.tsx:45` "Please try again."); the shared helper should take an optional fallback.
3. **D25 and D11 contract:** the web must send `expected` as a Record for the changed purposes only, taken from each row's `updatedAt` in `get` (null for no row). It must omit `acknowledgeDowngrade` unless true (old-API rule). On `PRECONDITION_FAILED` with `DOWNGRADE_UNCONFIRMED` the web should treat it as a stale-baseline signal: re-open the dialog from the server's `downgrades[]` rather than failing silently.
4. **D8 unit:** `get` returns `spentCents`, but storage is centi-cents. State in the interface comment that the API converts, so the web never divides.
5. **D26 "$0 blocks AI" and D4 `0 = block`:** the ceiling field must distinguish empty (no ceiling) from `0`. The web `Input` therefore parses to `null` only for the empty string, never via `Number('')` (which gives 0).

## Sign-off
APPROVED, with Modifications 1 to 5 recorded for the plan. No critical issue found.

## Final Notes
- Lighthouse risk is low: server shell plus skeleton, no new dependency (`next.config.js:58-62` covers barrel imports).
- The page needs `lighthouserc.authenticated.js` coverage; per D28 report NEEDS_HUMAN rather than fake it.
- Web test list for the plan: dirty/seed hook, combined downgrade dialog (multiple purposes, primary and fallback), CONFLICT keeps draft, calm NOT_FOUND `role=status`, retired option, ceiling-below-spend warning, `0` versus empty, rag locked row, email blocked state, fallback reorder live-region announcement.

## Files Verified
- `.specify/sprints/sprint-18/context/PG-199/rounds/R4-resolutions.md` (D1 to D29)
- `packages/domain/tsup.config.ts:4`, `packages/domain/package.json:9-26`
- `apps/web/next.config.js:52-70`, `vitest.config.ts:31`
- `apps/web/src/app/cases/(list)/case-types/CaseTypesContent.tsx:25-34` and its test `:95,346-351`
- `apps/web/src/app/contacts/(list)/contact-types/__tests__/ContactTypesContent.test.tsx:89,328-330`
- `apps/web/src/lib/shared/__tests__/settings-search.test.ts:13-15`
- `apps/web/src/app/agent-approvals/approval-policies/ApprovalPoliciesContent.tsx:14,45`

## Round 2 vote
APPROVED

Reviewed the "Amendments" section of `R4-resolutions.md` (A1 to A8). A3 and A8 match what I proposed. A2, A4 to A7 are outside the web lens and I have no objection. A1 does not change the page's contract with the user, because the page never edits `tier`; it does change two things the web must handle, recorded here as non-critical notes for the plan:

1. **Unpinned rows have no single "current model" (A1).** A row with `modelId = null` can resolve to different models per caller (`CALLER_DEFAULT_TIERS[purpose]`). The model `Select` therefore needs an explicit first option "Default (varies by feature)" with value `null`, and the card should show the range of default models and prices, not one model. `get` should return per row `defaultModelIds` (the set of caller-default models) or a `defaultMaxPriceMicroUsd`, or the web must import `CALLER_DEFAULT_TIERS` and `DEFAULT_MODEL` from domain. I prefer importing them from domain, so the client `findDowngrades(snapshot, draft)` uses the same max-price rule as the server (A1) and the confirm cannot disagree with the server check.
2. **Picking "Default" is itself a comparison.** Going from a pinned model to `null` compares the pinned price with the unpinned side, and `findDowngrades` must define it (the server rule decides it). The dialog text for that case must say "Use each feature's default model" and list the models, not a single price.
3. **`DEFAULT_MODEL` is partial (no `rag-standard`).** The rag row never offers a pin (locked, Q5), so the web must not index `DEFAULT_MODEL[rag][standard]`. The lookup helper should return `undefined` safely and the rag card should read "platform-managed embedding model" (D22).
4. **Tier is never in the payload.** `buildUpdateInput` must not include `tier`, and the draft/normalize comparator must ignore it, so a NULL tier cannot make a row look dirty.
