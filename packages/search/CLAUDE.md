# packages/search - Vector/FTS Search (⚠ ORPHANED, likely duplicated)

## Purpose

`@intelliflow/search` defines the **type contracts** for case-document search —
fulltext, semantic (pgvector), and hybrid
(`SearchMode = 'fulltext' | 'semantic' | 'hybrid'`). Created for **IFC-155**
(case document FTS + embeddings). Deps: `@intelliflow/db`, `zod`. NOTE: the
runtime implementation lives in `apps/ai-worker`, not here (see status below).

## Code Map (barrel `src/index.ts` + subpath exports)

| Export        | File                                                 |
| ------------- | ---------------------------------------------------- |
| `.`           | `index.ts` (`SEARCH_MODES`, `SEARCH_SOURCES`, types) |
| `./retrieval` | `retrieval.ts`                                       |
| `./indexer`   | `indexer.ts`                                         |
| `./worker`    | `worker.ts`                                          |
| (internal)    | `embedding-provider.ts` (`IEmbeddingProvider`)       |

## ⚠ Current status: TYPE STUBS ONLY — runtime lives in ai-worker (IFC-155 audit, 2026-05-30)

- These files export **only TypeScript interfaces + Zod schemas** — no concrete
  classes, no Prisma/embedding calls. Each says "Actual implementation in
  `apps/ai-worker/src/services/...`". So this is **not** a parallel duplicate of
  ai-worker; it's an unwired type-contract shell.
- The real, wired runtime is in `apps/ai-worker`: `RetrievalService` (~1,600 ln,
  exercised via `RAGContextChain` → `wireRetrievalService()`), `DocumentIndexer`
  (705 ln), `ReindexWorker` (458 ln), `EmbeddingPurgeService`.
- **No package declares `@intelliflow/search` as a dependency**; unused exports
  are `@knipignore`-suppressed. The IFC-155 attestation hash-verifies
  `packages/search/src/retrieval.ts` as a "delivered" artifact, which
  **overstates** what shipped (a stub, not a runtime impl).
- The two sides' type contracts have **drifted** (`extracted_text` vs
  `extractedText`; `searchMode` vs `searchType`; optional vs required
  `generateBatchEmbeddings`) — using these types against the real service
  breaks.

## Related audit defect (NOT in this package)

- GDPR purge is **not atomic** in production:
  `apps/api/src/workflow/dsar-workflow.ts` `purgeSearchIndexes()` runs two
  sequential `$executeRaw` (docs, then notes) with **no `$transaction`**,
  despite the attestation claiming atomic purge. The correct
  `EmbeddingPurgeService.$transaction` exists but was not wired in.

## For the next maintainer

- Do not delete (real IFC-155 capability). Decide (record in an ADR): either (a)
  make `ai-worker` import its types/impl from `@intelliflow/search`, or (b)
  formally mark this package **type-declarations-only** and drop the misleading
  runtime-artifact claim from the attestation/CSV.
