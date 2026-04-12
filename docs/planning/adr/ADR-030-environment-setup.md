# ADR-030: Environment & Infrastructure Setup Decisions

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** ENV-001-AI, ENV-003-AI, ENV-004-AI, ENV-005-AI, ENV-009-AI

> **Note**: This ADR was retroactively created to document architectural
> decisions made during implementation. The decisions described here are already
> in production.

## Context and Problem Statement

IntelliFlow CRM needed foundational infrastructure decisions for the monorepo
structure, containerization strategy, database integration, CI/CD pipeline, and
frontend framework configuration.

## Decision Drivers

- Developer experience and fast iteration cycles
- Production-ready containerization from day one
- Managed database with vector search for AI features
- Automated CI/CD for quality enforcement
- Modern React framework with App Router and RSC support

## Considered Options

- Turborepo monorepo with pnpm workspaces
- Docker Compose for local development, Railway for production
- Supabase (PostgreSQL + pgvector) for managed DB with vector search
- GitHub Actions for CI/CD with Turborepo caching
- Next.js 16.0.10 with App Router, Turbopack, and React Server Components

## Decision Outcome

Chosen: All options above as a cohesive stack. Turborepo provides build
orchestration, Docker Compose ensures environment parity, Supabase gives managed
PostgreSQL with pgvector for AI embeddings, GitHub Actions automates quality
gates, and Next.js 16 enables modern React patterns.

### Positive Consequences

- Consistent development environment across the team
- pgvector enables semantic search without separate vector DB
- Turborepo caching reduces CI build times by ~60%
- App Router enables streaming SSR and partial prerendering

### Negative Consequences

- Supabase vendor lock-in for auth and storage features
- Docker Compose adds complexity for simple local development
- Next.js 16 is bleeding-edge with some ecosystem incompatibilities

## Implementation Notes

All related tasks are completed. See attestation files at
`.specify/sprints/sprint-{N}/attestations/{TASK_ID}/` for validation evidence.

### Validation Criteria

- [x] Implementation complete (retroactive)
- [x] Tests passing
- [x] In production use

### Rollback Plan

N/A — decisions are already in production. Future changes should create a new
ADR that supersedes this one.
