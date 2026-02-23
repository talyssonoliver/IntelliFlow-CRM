# ADR-031: AI Pipeline Architecture (LangChain, CrewAI, BullMQ)

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** ENV-011-AI, IFC-005, IFC-015, IFC-020, IFC-021

> **Note**: This ADR was retroactively created to document architectural decisions
> made during implementation. The decisions described here are already in production.

## Context and Problem Statement

IntelliFlow CRM requires an AI pipeline for lead scoring, content generation, and multi-agent task orchestration. Decisions needed for the LLM framework, multi-agent system, and async job processing.

## Decision Drivers

- Structured output support for Zod schema validation
- Multi-agent orchestration for complex workflows
- Async processing for long-running AI tasks
- Local development support (Ollama) without cloud API costs
- Observability and debugging of AI chains

## Considered Options

- LangChain for structured chains with Zod output parsers
- CrewAI for multi-agent task delegation
- BullMQ for async job queue processing
- Ollama for local LLM development

## Decision Outcome

Chosen: LangChain + CrewAI + BullMQ as complementary layers. LangChain handles individual chains with structured output, CrewAI manages multi-agent orchestration, and BullMQ provides reliable async job processing with retry/DLQ.

### Positive Consequences

- LangChain Zod output parsers enforce type-safe AI responses
- CrewAI enables specialized agent roles (researcher, analyst, writer)
- BullMQ provides reliable job retry with exponential backoff
- Ollama eliminates API costs during development

### Negative Consequences

- Three frameworks increase learning curve
- CrewAI has less mature ecosystem than LangChain alone
- BullMQ requires Redis infrastructure

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
