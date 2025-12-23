# Documentation Chunking Strategy

## Overview

This document defines the chunking strategy for RAG (Retrieval-Augmented Generation) optimization in IntelliFlow CRM documentation.

## Chunk Size Guidelines

| Content Type | Target Size | Max Size | Overlap |
|-------------|-------------|----------|---------|
| API Reference | 500 tokens | 1000 tokens | 50 tokens |
| Conceptual | 800 tokens | 1500 tokens | 100 tokens |
| Code Examples | 300 tokens | 600 tokens | 0 tokens |
| Tutorials | 1000 tokens | 2000 tokens | 150 tokens |

## Semantic Boundaries

Chunks should break at:
- H2 headings (##)
- Code block boundaries
- Table boundaries
- List group boundaries

## Metadata Preservation

Each chunk includes:
- Document title
- Section path (H1 > H2 > H3)
- Tags from frontmatter
- Source file path

## Embedding Model

Using `text-embedding-3-small` (1536 dimensions) for:
- Cost efficiency ($0.00002/embedding)
- Sufficient quality for documentation search
- Fast generation (<50ms)

## Index Structure

```
pgvector index on documentation_chunks
- id: UUID
- content: TEXT
- embedding: VECTOR(1536)
- metadata: JSONB
- created_at: TIMESTAMP
```

## Query Strategy

1. Semantic search with cosine similarity
2. Filter by document type/section
3. Rerank by recency if applicable
4. Return top 5 chunks with context
