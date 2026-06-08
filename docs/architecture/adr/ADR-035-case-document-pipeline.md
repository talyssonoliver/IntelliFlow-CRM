# ADR-035: Case Document Pipeline Architecture

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** IFC-152, IFC-153, IFC-154, IFC-155, IFC-156

> **Note**: This ADR was retroactively created to document architectural
> decisions made during implementation.

> **Correction (2026-06-07):** the original text claimed the entire pipeline —
> including a "BullMQ OCR worker (Tesseract.js)" — was "already in production."
> That is inaccurate on two counts: (1) there is **no Tesseract.js dependency**
> anywhere in the workspace, and (2) the worker tier (including the
> OCR/ingestion worker) has **no production deployment path** — see
> [#230](https://github.com/talyssonoliver/IntelliFlow-CRM/issues/230) and
> [#270](https://github.com/talyssonoliver/IntelliFlow-CRM/issues/270)
> (ingestion-worker superseded by ai-worker). The storage/RLS, pgvector search,
> and RAG-tool portions are in use; the async-OCR-worker portion is **designed
> and present in code but not deployed**. See the qualified status below.

## Context and Problem Statement

The legal/case management domain requires a document pipeline: storage model,
ingestion (upload + metadata), OCR for scanned documents, permissioned full-text
search, and RAG (Retrieval-Augmented Generation) for AI-assisted case research.

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

Chosen: Supabase Storage with RLS for permissioned access, BullMQ OCR worker for
async processing, pgvector for semantic search embeddings, and tRPC tool for RAG
agent integration.

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
- [~] In production use — **partial**: storage/RLS, pgvector search, and the RAG
  tool are in use; the async OCR/ingestion worker is implemented in code but
  **not deployed** (no worker prod deploy path — #230; superseded by ai-worker —
  #270), and does **not** use Tesseract.js.

### Rollback Plan

N/A for the deployed portions. The OCR/ingestion-worker portion is not in
production (see Correction above). Future changes should create a new ADR that
supersedes this one.
