# ADR-035: Case Document Pipeline Architecture

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** IFC-152, IFC-153, IFC-154, IFC-155, IFC-156

> **Note**: This ADR was retroactively created to document architectural decisions
> made during implementation. The decisions described here are already in production.

## Context and Problem Statement

The legal/case management domain requires a document pipeline: storage model, ingestion (upload + metadata), OCR for scanned documents, permissioned full-text search, and RAG (Retrieval-Augmented Generation) for AI-assisted case research.

## Decision Drivers

- Support for multiple document formats (PDF, DOCX, images)
- OCR capability for scanned legal documents
- Permission-aware search (users only see authorized documents)
- RAG integration for AI case research assistant
- Audit trail for all document operations

## Considered Options

- Supabase Storage for document files with RLS policies
- BullMQ worker for async OCR processing (Tesseract.js)
- pgvector embeddings for semantic document search
- tRPC tool registration for Case RAG agent

## Decision Outcome

Chosen: Supabase Storage with RLS for permissioned access, BullMQ OCR worker for async processing, pgvector for semantic search embeddings, and tRPC tool for RAG agent integration.

### Positive Consequences

- RLS enforces document permissions at database level
- Async OCR processing doesn't block user interactions
- pgvector enables semantic search across case documents
- RAG tool gives AI agent access to case-specific knowledge

### Negative Consequences

- OCR accuracy varies with document quality
- pgvector embeddings require periodic reindexing
- RAG hallucination risk requires citation verification

## Implementation Notes

All related tasks are completed. See attestation files at
`.specify/sprints/sprint-{N}/attestations/{TASK_ID}/` for validation evidence.

### Validation Criteria

- [x] Implementation complete (retroactive)
- [x] Tests passing
- [x] In production use

### Rollback Plan

N/A — decisions are already in production. Future changes should create a new ADR
that supersedes this one.
