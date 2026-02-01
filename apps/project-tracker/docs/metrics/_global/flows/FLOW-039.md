# FLOW-039: Document Search (FTS + Semantic)

## Overview

| Property | Value |
|----------|-------|
| **Flow ID** | FLOW-039 |
| **Name** | Document Search with ACL Enforcement |
| **Category** | Search/AI |
| **Priority** | Critical |
| **Sprint** | 12 |
| **Related Tasks** | IFC-155, IFC-089 |

## Description

Enables users to search case documents and contact notes using hybrid search (full-text + semantic/vector) with tenant and case-level ACL enforcement.

---

## Actors

- **End User**: Searches for documents within their permitted scope
- **System**: Executes search queries with ACL filtering
- **AI Worker**: Generates embeddings for semantic search
- **Database**: Stores and retrieves indexed documents (pgvector + tsvector)

---

## Pre-conditions

- User is authenticated and has valid session
- User has at least one tenant membership
- Documents have been indexed (embedding + search_vector populated)
- pgvector extension enabled in PostgreSQL

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENT SEARCH FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

[User] enters search query in SearchBar
         │
         ▼
┌─────────────────┐
│  SearchBar      │ (apps/web/src/components/search/SearchBar.tsx)
│  Component      │ - Debounced input (300ms)
│                 │ - Minimum 3 characters
│                 │ - Search type selector (FTS/Semantic/Hybrid)
└────────┬────────┘
         │
         ▼ tRPC mutation
┌─────────────────┐
│  search.router  │ (apps/api/src/modules/search/search.router.ts)
│  - documents()  │ - Validates SearchInput schema
│  - notes()      │ - Extracts user context (tenantId, userId, roles)
│  - hybrid()     │ - Calls RetrievalService
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RetrievalService│ (apps/ai-worker/src/services/retrieval-service.ts)
│                 │ - searchDocumentsFTS() - PostgreSQL ts_rank_cd
│                 │ - searchDocumentsSemantic() - pgvector cosine
│                 │ - searchDocumentsHybrid() - RRF fusion
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ACL Filtering  │ - Tenant isolation (tenant_id = user.tenantId)
│                 │ - Case access check (user has case permission)
│                 │ - Creator ownership (user created document)
│                 │ - Admin override (ADMIN role bypasses)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Search Results │ (apps/web/src/app/search/page.tsx)
│  Page           │ - Paginated results (20 per page)
│                 │ - Snippet highlighting (ts_headline)
│                 │ - Relevance score display
│                 │ - Document type badges
│                 │ - Case association links
└─────────────────┘
```

---

## Flow Steps

### Step 1: User Initiates Search

**Trigger**: User types in SearchBar component

**Input**:
```typescript
interface SearchInput {
  query: string;           // Minimum 3 characters
  searchType: 'fts' | 'semantic' | 'hybrid';  // Default: hybrid
  filters?: {
    caseId?: string;       // Optional: scope to specific case
    documentType?: DocumentType[];
    dateRange?: { from: Date; to: Date };
    classification?: DocumentClassification[];
  };
  pagination: {
    page: number;
    pageSize: number;      // Default: 20, max: 100
  };
}
```

**Actions**:
1. SearchBar validates input (min length, sanitization)
2. Debounce prevents excessive API calls
3. tRPC mutation triggered: `trpc.search.documents.useMutation()`

---

### Step 2: API Router Processing

**Location**: `apps/api/src/modules/search/search.router.ts`

**Actions**:
1. Extract authenticated user context from tRPC context
2. Validate SearchInput against Zod schema
3. Build ACL context using `ACLService.buildContext()`
4. Route to appropriate RetrievalService method based on searchType
5. Apply rate limiting (100 searches/minute per user)

**Security Checks**:
- Authenticated user required
- Tenant membership verified
- Input sanitized against injection

---

### Step 3: Retrieval Service Execution

**Location**: `apps/ai-worker/src/services/retrieval-service.ts`

**Search Methods**:

| Method | Algorithm | Use Case |
|--------|-----------|----------|
| `searchDocumentsFTS()` | PostgreSQL `ts_rank_cd` + `plainto_tsquery` | Exact keyword matching |
| `searchDocumentsSemantic()` | pgvector cosine similarity (`<=>`) | Conceptual similarity |
| `searchDocumentsHybrid()` | Reciprocal Rank Fusion (RRF) | Best of both worlds |

**ACL Enforcement**:
```sql
WHERE tenant_id = $tenantId
  AND (
    created_by = $userId
    OR case_id IN (SELECT case_id FROM case_permissions WHERE user_id = $userId)
    OR $isAdmin = true
  )
```

---

### Step 4: Results Returned

**Output**:
```typescript
interface SearchResult {
  id: string;
  documentId: string;
  title: string;
  snippet: string;         // Highlighted excerpt with <mark> tags
  score: number;           // 0-1 relevance score
  documentType: DocumentType;
  classification: DocumentClassification;
  caseId?: string;
  caseName?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    fileSize: number;
    pageCount?: number;
    version: string;
  };
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  searchTime: number;      // milliseconds
  searchType: string;
}
```

---

### Step 5: UI Rendering

**Location**: `apps/web/src/app/search/page.tsx`

**Components**:
- `SearchResultCard` - Individual result display
- `SearchFilters` - Document type, date range, classification
- `Pagination` - Page navigation
- `SearchMetrics` - Results count, search time

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Empty query | Show recent documents instead |
| No results | Display "No documents found" with search tips |
| Query too short | Show validation message (min 3 chars) |
| Rate limit exceeded | 429 response with retry-after header |
| Search timeout (>5s) | Cancel and suggest narrower query |
| Invalid characters | Sanitize or reject with error |
| Cross-tenant attempt | Filter results; no error (silent ACL) |

---

## Technical Artifacts

### Backend (IMPLEMENTED)

| Artifact | Path | Status |
|----------|------|--------|
| Document Indexer | `apps/ai-worker/src/services/document-indexer.ts` | COMPLETE |
| Retrieval Service | `apps/ai-worker/src/services/retrieval-service.ts` | COMPLETE |
| Embedding Chain | `apps/ai-worker/src/chains/embedding.chain.ts` | COMPLETE |
| DB Migration | `infra/supabase/migrations/20260104000001_case_document_fts_embeddings.sql` | COMPLETE |

### API Layer (GAP)

| Artifact | Path | Status |
|----------|------|--------|
| Search Router | `apps/api/src/modules/search/search.router.ts` | **NOT IMPLEMENTED** |
| Search Validators | `packages/validators/src/search.ts` | **NOT IMPLEMENTED** |

### Frontend (GAP)

| Artifact | Path | Status |
|----------|------|--------|
| SearchBar | `apps/web/src/components/search/SearchBar.tsx` | **NOT IMPLEMENTED** |
| Search Page | `apps/web/src/app/search/page.tsx` | **NOT IMPLEMENTED** |
| SearchResultCard | `apps/web/src/components/search/SearchResultCard.tsx` | **NOT IMPLEMENTED** |

---

## Performance Requirements

| Metric | Target | Current |
|--------|--------|---------|
| Search latency p95 | <200ms | ~150ms (backend only) |
| Search latency p99 | <500ms | TBD |
| Results per page | 20 | N/A |
| Max results | 1000 | N/A |
| Indexing throughput | >100 docs/sec | TBD |

---

## Success Metrics

| KPI | Target | Validation |
|-----|--------|------------|
| Zero cross-tenant leakage | 0 violations | ACL tests passing |
| Search relevance | >80% on test set | `artifacts/misc/relevance-eval.json` |
| User adoption | >50% DAU use search | Analytics tracking |
| Search success rate | >90% find relevant doc | User feedback |

---

## Related Flows

- **FLOW-020**: Activity Timeline (includes document events)
- **FLOW-040**: DSAR Data Erasure (purges search indexes)
- **FLOW-041**: Case RAG Retrieval (agent search tool)

---

## Implementation Tasks

| Task | Sprint | Status |
|------|--------|--------|
| IFC-155 | 12 | COMPLETED (backend) |
| IFC-089 | 6 | COMPLETED (search integration) |
| **Search Router** | TBD | NOT STARTED |
| **Search UI** | TBD | NOT STARTED |

---

*Flow documented: 2026-01-31*
*Last updated: 2026-01-31*
