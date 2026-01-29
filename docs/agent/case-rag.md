# Case RAG Tool Documentation

**Task**: IFC-156
**Status**: Implemented
**Sprint**: 13
**Section**: AI Assistant

## Overview

The Case RAG (Retrieval-Augmented Generation) tool enables AI agents to retrieve relevant context from legal cases with full permission enforcement, citation tracking, and security hardening.

## Features

### 1. Permission-Constrained Retrieval

All retrievals are constrained by:
- **Tenant isolation**: Queries scoped to `tenant_id` via RLS
- **Case access verification**: User must be owner, assignee, or have role-based access
- **Document ACL checks**: Each document's access control list is verified

```typescript
const accessResult = await verifyCaseAccess(prisma, caseId, userId, tenantId);
if (!accessResult.hasAccess) {
  throw new Error(`Access denied: ${accessResult.reason}`);
}
```

### 2. Citation and Source Tracing

Every piece of retrieved content includes full citation metadata:

```typescript
interface Citation {
  id: string;                    // Unique citation ID
  sourceType: 'case' | 'document' | 'task' | 'note' | 'conversation';
  sourceId: string;              // Original source ID
  title: string;                 // Human-readable title
  retrievedAt: string;           // ISO timestamp
  relevanceScore: number;        // 0-1 relevance score
  snippet: string;               // Sanitized content snippet
  metadata: Record<string, unknown>; // Source-specific metadata
}
```

### 3. Prompt Injection Hardening

Retrieved content is sanitized to prevent prompt injection attacks:

#### Dangerous Pattern Detection
- `ignore previous instructions` patterns
- `you are now` role injection patterns
- System prompt markers (`[system]`, `<|im_start|>`, etc.)
- HTML/script injection attempts

#### Content Sanitization
- Escapes dangerous characters: `< > { } [ ] \ ``
- Replaces detected injection patterns with `[CONTENT_FILTERED]`
- Limits consecutive newlines
- Truncates excessively long content

#### Boundary Markers
Content is wrapped with clear boundaries:
```
<<<RETRIEVED_CONTENT_START>>>[Source: doc-123]
[Sanitized content here]
<<<RETRIEVED_CONTENT_END>>>
```

### 4. Human Approval for External Actions

Actions that affect external systems require human approval:

| Action | Requires Approval |
|--------|-------------------|
| `send_email` | Yes |
| `share_externally` | Yes |
| `export_case` | Yes |
| `delete_document` | Yes |
| `change_case_status` | Yes |
| `retrieve_context` | No |
| `search` | No |

## Usage

### Creating the Tool

```typescript
import { createRetrieveCaseContextTool } from '@intelliflow/ai';
import { prisma } from '@intelliflow/db';

const tool = createRetrieveCaseContextTool(prisma, userId, tenantId);
```

### Using with LangChain Agents

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';

const model = new ChatOpenAI({ model: 'gpt-4' });
const tools = [createRetrieveCaseContextTool(prisma, userId, tenantId)];

const agent = await createToolCallingAgent({
  llm: model,
  tools,
  prompt: systemPrompt,
});

const executor = new AgentExecutor({ agent, tools });
```

### Input Parameters

```typescript
{
  caseId: string;          // UUID of the case
  query: string;           // Search query (1-1000 chars)
  includeDocuments?: boolean; // Default: true
  includeTasks?: boolean;     // Default: true
  includeNotes?: boolean;     // Default: true
  maxResults?: number;        // Default: 10, max: 50
  minRelevanceScore?: number; // Default: 0.3
}
```

### Output Format

```typescript
{
  success: boolean;
  context?: string;           // Sanitized, bounded content
  citations?: Citation[];     // Source citations
  totalSources?: number;
  queryTimeMs?: number;
  error?: string;
  requiresApproval?: boolean;
  approvalReason?: string;
}
```

## Security Considerations

### Audit Logging

All retrieval operations are logged to the audit table:

```typescript
{
  eventType: 'CaseRAGRetrieval',
  resourceType: 'case',
  resourceId: caseId,
  action: 'READ',
  metadata: {
    query,
    resultCount,
    queryTimeMs
  }
}
```

### Rate Limiting

Consider implementing rate limiting at the API layer to prevent abuse:
- Per-user: 100 retrievals/minute
- Per-tenant: 1000 retrievals/minute

### Content Classification

Documents with `PRIVILEGED` classification require additional attorney-client privilege checks.

## Performance

**Target**: <2s response time

Optimizations:
- Parallel source retrieval
- Early termination at `maxResults`
- Relevance score filtering before processing
- Efficient ACL queries with indexes

## Testing

Run tests with:
```bash
pnpm --filter @intelliflow/ai test
```

Test coverage includes:
- Prompt injection pattern detection
- Content sanitization edge cases
- Schema validation
- Permission verification logic
- Human approval requirements

## Dependencies

- IFC-155: Permissioned Indexing (RetrievalService)
- IFC-139: Case Entity
- IFC-125: Multi-tenancy Infrastructure

## Related ADRs

- [ADR-004: Multi-tenancy Architecture](../planning/adr/ADR-004-multi-tenancy.md)
- [ADR-006: Agent Tool-Calling Model](../planning/adr/ADR-006-agent-tools.md)
