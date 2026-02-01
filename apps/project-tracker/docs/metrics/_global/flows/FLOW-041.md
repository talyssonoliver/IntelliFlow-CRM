# FLOW-041: Case RAG Retrieval (Agent Tool)

## Overview

| Property | Value |
|----------|-------|
| **Flow ID** | FLOW-041 |
| **Name** | Case RAG Retrieval Tool |
| **Category** | AI Assistant |
| **Priority** | Critical |
| **Sprint** | 13 |
| **Related Tasks** | IFC-156, IFC-155, IFC-139 |

## Description

AI Agent retrieval tool that fetches relevant case documents and notes using RAG (Retrieval Augmented Generation). Enforces tenant/case ACL constraints, includes citations with source tracing, and applies prompt-injection hardening on retrieved content.

---

## Actors

- **AI Agent**: CrewAI agent executing tool call
- **End User**: Interacts with agent via chat interface
- **RetrievalService**: Performs vector similarity search
- **ACL Service**: Enforces permission constraints
- **Guardrails**: Sanitizes retrieved content

---

## Pre-conditions

- User authenticated with valid session
- Agent has `retrieve_case_context` tool enabled
- Case documents indexed with embeddings
- Prompt sanitizer configured

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CASE RAG RETRIEVAL FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

[User] asks question about case documents
         │
         ▼
┌─────────────────┐
│  Agent Chat     │ (apps/web/src/app/agent/chat/page.tsx)
│  Interface      │ - User input: "What does the contract say about..."
│                 │ - Agent determines tool needed
└────────┬────────┘
         │
         ▼ Tool Call
┌─────────────────┐
│ retrieve_case_  │ (packages/ai/tools/retrieve-case-context.ts) [EXISTS]
│ context Tool    │ - Receives: query, caseId, topK
│                 │ - Validates permissions
│                 │ - Calls RetrievalService
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ RetrievalService│ (apps/ai-worker/src/services/retrieval-service.ts)
│                 │ - searchDocumentsSemantic()
│                 │ - Cosine similarity search
│                 │ - Returns top-K results
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ACL Filtering  │ - Tenant scope enforcement
│                 │ - Case permission check
│                 │ - Document classification check
│                 │ - Privileged content filter
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Prompt Sanitizer│ (apps/api/src/shared/prompt-sanitizer.ts)
│                 │ - Strip injection attempts
│                 │ - Escape special sequences
│                 │ - Redact sensitive patterns
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Citation Builder│ - Document ID
│                 │ - Page/section reference
│                 │ - Snippet with context
│                 │ - Confidence score
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Agent Response │ - Synthesized answer
│                 │ - Source citations
│                 │ - "Based on [Doc Title]..."
│                 │ - Approval workflow (if external)
└─────────────────┘
```

---

## Flow Steps

### Step 1: User Query to Agent

**Trigger**: User sends message in agent chat interface

**Input**:
```typescript
interface AgentChatMessage {
  content: string;       // User's question
  caseId?: string;       // Current case context
  sessionId: string;     // Chat session ID
  attachments?: string[]; // Referenced document IDs
}
```

**Agent Processing**:
1. Agent analyzes query intent
2. Determines `retrieve_case_context` tool is needed
3. Extracts search query from user message
4. Calls tool with parameters

---

### Step 2: Tool Invocation

**Location**: `packages/ai/tools/retrieve-case-context.ts`

**Tool Schema**:
```typescript
interface RetrieveCaseContextInput {
  query: string;           // Semantic search query
  caseId: string;          // Case to search within
  topK?: number;           // Results to return (default: 5, max: 20)
  documentTypes?: string[]; // Filter by document type
  minScore?: number;       // Minimum similarity threshold (default: 0.7)
}
```

**Actions**:
1. Validate user has access to specified caseId
2. Generate query embedding via EmbeddingChain
3. Execute vector similarity search
4. Filter results by ACL
5. Apply prompt sanitization
6. Build citations

---

### Step 3: Retrieval Execution

**Location**: `apps/ai-worker/src/services/retrieval-service.ts`

**Query**:
```sql
SELECT
  id, title, extracted_text,
  1 - (embedding <=> $queryVector) as similarity
FROM case_documents
WHERE
  case_id = $caseId
  AND tenant_id = $tenantId
  AND embedding IS NOT NULL
  AND 1 - (embedding <=> $queryVector) >= $minScore
ORDER BY similarity DESC
LIMIT $topK
```

**Output**: Ranked documents with similarity scores

---

### Step 4: ACL Enforcement

**Checks**:

| Check | Rule |
|-------|------|
| Tenant | Document tenant_id = user's active tenant |
| Case Access | User has permission on case (owner, assigned, or admin) |
| Classification | PRIVILEGED documents require explicit permission |
| Creator | Notes visible to author + admin only |

**Denied Access**: Document silently excluded from results (no error exposed)

---

### Step 5: Prompt Injection Hardening

**Location**: `apps/api/src/shared/prompt-sanitizer.ts`

**Sanitization Rules**:

| Pattern | Action |
|---------|--------|
| `IGNORE PREVIOUS INSTRUCTIONS` | Strip |
| `<script>...</script>` | Remove tags |
| `{{...}}` template literals | Escape |
| Markdown injection `![](...)` | Neutralize |
| Excessive special characters | Truncate |

**Output**: Sanitized text safe for LLM context

---

### Step 6: Citation Building

**Citation Format**:
```typescript
interface Citation {
  documentId: string;
  documentTitle: string;
  pageNumber?: number;
  sectionHeading?: string;
  snippet: string;           // 200 chars max, highlighted
  similarity: number;        // 0-1 score
  retrievedAt: Date;
}
```

**Example Citation**:
```
[1] Contract_2024_001.pdf (Page 12, Section 4.2)
    "...the party shall provide notice within thirty (30) days..."
    Relevance: 0.92
```

---

### Step 7: Agent Response Generation

**Context Injection**:
```
Retrieved Context:
[1] {document_title} - {snippet}
[2] {document_title} - {snippet}
...

User Question: {original_query}

Please answer based on the retrieved context. Cite sources using [1], [2] format.
If the context doesn't contain the answer, say so.
```

**Response Format**:
```typescript
interface AgentResponse {
  content: string;           // Synthesized answer
  citations: Citation[];     // Source references
  confidence: number;        // 0-1 answer confidence
  requiresApproval?: boolean; // If sending externally
  suggestedActions?: string[]; // Follow-up suggestions
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No relevant documents | "I couldn't find relevant information in the case documents." |
| All results filtered by ACL | Return empty results (don't reveal existence) |
| Injection attempt in retrieved text | Sanitize before adding to context |
| Large document (>10K tokens) | Chunk and return most relevant chunk |
| Multiple cases mentioned | Require explicit caseId parameter |
| Hallucination risk | Include "Based on documents..." disclaimer |

---

## Technical Artifacts

### Backend (IMPLEMENTED)

| Artifact | Path | Status |
|----------|------|--------|
| RAG Tool | `packages/ai/tools/retrieve-case-context.ts` | COMPLETE |
| Retrieval Service | `apps/ai-worker/src/services/retrieval-service.ts` | COMPLETE |
| Prompt Sanitizer | `apps/api/src/shared/prompt-sanitizer.ts` | COMPLETE |
| Case RAG Docs | `docs/agent/case-rag.md` | COMPLETE |

### Frontend (PARTIAL)

| Artifact | Path | Status |
|----------|------|--------|
| Agent Chat | `apps/web/src/app/agent/chat/page.tsx` | PARTIAL |
| Citation Display | `apps/web/src/components/agent/CitationCard.tsx` | **NOT IMPLEMENTED** |
| Source Preview | `apps/web/src/components/agent/SourcePreview.tsx` | **NOT IMPLEMENTED** |

---

## Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Tenant isolation | All queries include tenant_id filter |
| Case ACL | Permission check before retrieval |
| Prompt injection | Content sanitized before LLM context |
| Audit logging | Tool invocations logged |
| Rate limiting | Max 10 retrievals per minute per user |

---

## Performance Requirements

| Metric | Target |
|--------|--------|
| Retrieval latency p95 | <2s |
| Vector search time | <500ms |
| Embedding generation | <1s |
| Total tool execution | <3s |

---

## Success Metrics

| KPI | Target | Validation |
|-----|--------|------------|
| Zero unauthorized retrievals | 0 violations | ACL audit logs |
| Response time p95 | <2s | Performance monitoring |
| Hallucination rate | <5% | Human evaluation |
| Citation accuracy | >95% | Spot checks |
| User satisfaction | >80% | Feedback survey |

---

## Guardrails

### Input Guardrails
- Query length: 10-500 characters
- CaseId: Valid UUID, user has access
- TopK: 1-20 (default 5)

### Output Guardrails
- Content sanitized before LLM
- PRIVILEGED documents require explicit handling
- External sharing requires approval workflow

---

## Related Flows

- **FLOW-039**: Document Search (same retrieval backend)
- **FLOW-040**: DSAR Erasure (purges RAG-indexed content)
- **FLOW-020**: Activity Timeline (agent actions logged)

---

## Implementation Tasks

| Task | Sprint | Status |
|------|--------|--------|
| IFC-156 | 13 | COMPLETED |
| IFC-155 (retrieval backend) | 12 | COMPLETED |
| IFC-139 (guardrails) | 10 | COMPLETED |
| **Citation UI** | TBD | NOT STARTED |
| **Agent Chat Enhancement** | TBD | NOT STARTED |

---

*Flow documented: 2026-01-31*
*Last updated: 2026-01-31*
