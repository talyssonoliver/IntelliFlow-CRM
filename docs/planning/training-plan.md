# IntelliFlow CRM - Modern Stack Training Plan

**Task ID:** IFC-009 (PHASE-002: Team Capability Assessment) **Version:** 1.0
**Date:** 2025-12-26 **Owner:** PM + Tech Lead (STOA-Foundation) **Status:**
Active

---

## Executive Summary

This training plan addresses the skill gaps identified in the Team Capability
Assessment (IFC-009) for the IntelliFlow CRM modern technology stack. The plan
targets achieving and maintaining >=80% team confidence across all critical
stack components.

### Target Stack Components

| Category       | Technology            | Version  | Priority |
| -------------- | --------------------- | -------- | -------- |
| Frontend       | Next.js 16 App Router | 16.0.10  | Critical |
| Build          | Turbopack FS Caching  | Latest   | High     |
| Performance    | Cache Components      | Built-in | High     |
| Networking     | Proxy Middleware      | Custom   | Medium   |
| API            | tRPC                  | 11.8.0   | Critical |
| Database       | Prisma ORM            | 5.x      | Critical |
| AI/ML          | LangChain             | Latest   | High     |
| AI Agents      | CrewAI                | Latest   | High     |
| Build          | Turborepo             | Latest   | High     |
| Infrastructure | Docker Compose        | Latest   | Medium   |

---

## Training Schedule

### Week 1-2: AI Stack Foundation (Priority: High)

**Focus:** LangChain + CrewAI (Gap: 15% each)

#### Day 1-3: LangChain Fundamentals

- **Module 1.1:** LangChain Architecture Overview (2 hours)
  - Components: Models, Prompts, Chains, Agents
  - LCEL (LangChain Expression Language)
  - Memory and State Management

- **Module 1.2:** Chains and Prompts (3 hours)
  - PromptTemplate construction
  - LLMChain implementation
  - Sequential and Router Chains
  - Structured Output Parsing with Zod

- **Resources:**
  - [LangChain JS Documentation](https://js.langchain.com/docs)
  - [LangChain Cookbook](https://github.com/langchain-ai/langchain/tree/master/cookbook)
  - Internal POC: `apps/ai-worker/src/chains/`

#### Day 4-5: LangChain Advanced Patterns

- **Module 1.3:** RAG (Retrieval-Augmented Generation) (3 hours)
  - Vector stores (pgvector integration)
  - Document loaders and splitters
  - Retrieval chains

- **Module 1.4:** Agents and Tools (3 hours)
  - Agent types (ReAct, OpenAI Functions)
  - Custom tool creation
  - Agent memory management

- **Hands-on Lab:** Build a lead scoring chain with RAG
  - Duration: 2 hours
  - Output: Working scoring chain integrated with Supabase pgvector

#### Day 6-7: CrewAI Multi-Agent Systems

- **Module 1.5:** CrewAI Fundamentals (3 hours)
  - Agent definition and roles
  - Task delegation patterns
  - Crew orchestration

- **Module 1.6:** Production Patterns (3 hours)
  - Error handling in multi-agent workflows
  - Monitoring and observability
  - Cost optimization strategies

- **Hands-on Lab:** Build a lead qualification crew
  - Duration: 3 hours
  - Agents: Research, Qualification, Email Generation
  - Output: Working multi-agent workflow

#### Week 1-2 Assessment

- Quiz: LangChain + CrewAI concepts (30 min)
- Practical: Implement a custom chain (1 hour)
- Target Score: >=80%

---

### Week 3: Next.js 16 Deep Dive (Priority: High)

**Focus:** App Router, Cache Components, Turbopack

#### Day 1-2: App Router Architecture

- **Module 2.1:** Next.js 16 App Router (3 hours)
  - File-system routing conventions
  - Layouts, Templates, and Loading UI
  - Route Groups and Parallel Routes
  - Intercepting Routes

- **Module 2.2:** Server Components (3 hours)
  - Server vs Client Components decision tree
  - Data fetching patterns
  - Streaming and Suspense
  - Error boundaries

- **Resources:**
  - [Next.js 16 Documentation](https://nextjs.org/docs)
  - [App Router Migration Guide](https://nextjs.org/docs/app/building-your-application/upgrading/app-router-migration)
  - ADR-001: `docs/planning/adr/ADR-001-modern-stack.md`

#### Day 3-4: Cache Components and Performance

- **Module 2.3:** Caching Strategies (3 hours)
  - Static vs Dynamic rendering
  - `cache()` function usage
  - Data Cache vs Full Route Cache
  - Revalidation patterns (time-based, on-demand)

- **Module 2.4:** Cache Components Implementation (3 hours)
  - Component-level caching
  - `unstable_cache` for data caching
  - Edge caching considerations
  - Cache debugging and monitoring

- **Hands-on Lab:** Implement optimized dashboard
  - Duration: 2 hours
  - Implement: Cached data components, streaming UI
  - Target: FCP < 1s, TTI < 2s

#### Day 5: Turbopack and Build Optimization

- **Module 2.5:** Turbopack FS Caching (2 hours)
  - How Turbopack caching works
  - Configuration options
  - Cache invalidation strategies
  - CI/CD integration

- **Module 2.6:** Proxy Middleware Patterns (2 hours)
  - Middleware vs Route Handlers
  - Authentication middleware
  - Request rewriting and proxying
  - Edge middleware considerations

#### Week 3 Assessment

- Quiz: Next.js 16 concepts (30 min)
- Practical: Build cached component system (1 hour)
- Target Score: >=80%

---

### Week 4: API and Database Layer (Priority: Critical)

**Focus:** tRPC + Prisma integration

#### Day 1-2: tRPC Mastery

- **Module 3.1:** tRPC Architecture (3 hours)
  - Router and procedure definitions
  - Input validation with Zod
  - Context and middleware
  - Error handling patterns

- **Module 3.2:** Advanced tRPC (3 hours)
  - Subscriptions via WebSocket
  - Batch requests
  - Optimistic updates
  - React Query integration

- **Resources:**
  - [tRPC Documentation](https://trpc.io)
  - Internal implementation: `apps/api/src/modules/`

#### Day 3-4: Prisma ORM Excellence

- **Module 3.3:** Prisma Schema Design (3 hours)
  - Model relationships
  - Migrations workflow
  - Seeding strategies
  - Performance considerations

- **Module 3.4:** Advanced Queries (3 hours)
  - Raw SQL for complex queries
  - Transactions and nested writes
  - Pagination patterns
  - Query optimization with `explain`

- **Hands-on Lab:** Build type-safe API endpoints
  - Duration: 3 hours
  - Implement: CRUD operations with full type safety
  - Target: Query latency < 50ms

#### Day 5: Integration Patterns

- **Module 3.5:** Full Stack Type Safety (3 hours)
  - Prisma to tRPC type flow
  - Frontend type inference
  - Error propagation patterns
  - Testing type-safe APIs

#### Week 4 Assessment

- Quiz: tRPC + Prisma concepts (30 min)
- Practical: Full CRUD implementation (1.5 hours)
- Target Score: >=85%

---

### Ongoing: Self-Paced Learning

#### Infrastructure (Priority: Medium)

- Docker Compose advanced patterns (2 hours)
- Turborepo task configuration (2 hours)
- Observability setup with OpenTelemetry (2 hours)

#### Resources Library

- Internal documentation: `docs/`
- Architecture decisions: `docs/planning/adr/`
- Code examples: `apps/` and `packages/`

---

## Learning Resources

### Official Documentation

| Technology | Resource                      | Priority |
| ---------- | ----------------------------- | -------- |
| Next.js 16 | https://nextjs.org/docs       | Critical |
| tRPC       | https://trpc.io               | Critical |
| Prisma     | https://www.prisma.io/docs    | Critical |
| LangChain  | https://js.langchain.com/docs | High     |
| CrewAI     | https://docs.crewai.com       | High     |
| Turborepo  | https://turbo.build/repo/docs | High     |
| Supabase   | https://supabase.com/docs     | Medium   |

### Video Courses

| Course               | Provider        | Duration | Topic          |
| -------------------- | --------------- | -------- | -------------- |
| Next.js 14+ Mastery  | Vercel          | 8 hours  | App Router     |
| tRPC End-to-End      | YouTube         | 3 hours  | Type Safety    |
| LangChain Full Stack | DeepLearning.AI | 6 hours  | AI Integration |

### Internal Resources

| Resource  | Location                                    | Purpose                 |
| --------- | ------------------------------------------- | ----------------------- |
| ADR-001   | `docs/planning/adr/ADR-001-modern-stack.md` | Architecture decisions  |
| Framework | `artifacts/sprint0/codex-run/Framework.md`  | STOA governance         |
| POC Code  | `apps/`                                     | Working implementations |

---

## Assessment Schedule

### Competency Tests

| Test                   | Week   | Topics              | Pass Threshold |
| ---------------------- | ------ | ------------------- | -------------- |
| AI Stack Assessment    | Week 2 | LangChain, CrewAI   | 80%            |
| Frontend Assessment    | Week 3 | Next.js 16, Caching | 80%            |
| Backend Assessment     | Week 4 | tRPC, Prisma        | 85%            |
| Integration Assessment | Week 5 | Full Stack          | 80%            |

### Practical Evaluations

| Evaluation              | Week   | Deliverable              | Criteria         |
| ----------------------- | ------ | ------------------------ | ---------------- |
| AI Chain Implementation | Week 2 | Lead scoring chain       | Working + tests  |
| Cached Dashboard        | Week 3 | Performance optimized UI | FCP < 1s         |
| Type-Safe API           | Week 4 | CRUD operations          | Full type flow   |
| Integration Demo        | Week 5 | End-to-end feature       | All criteria met |

---

## Success Metrics

### Target KPIs

| Metric               | Target | Measurement          |
| -------------------- | ------ | -------------------- |
| Team Confidence      | >=80%  | Post-training survey |
| Test Pass Rate       | >=80%  | Competency tests     |
| Practical Completion | 100%   | Lab deliverables     |
| Knowledge Retention  | >=75%  | 30-day follow-up     |

### Progress Tracking

- Weekly progress reports
- Individual skill gap tracking
- Buddy pairing for peer learning
- Tech lead office hours (2x/week)

---

## Training Support

### Mentorship Structure

- **Tech Lead:** Overall guidance, architecture questions
- **Senior Dev1:** Next.js, Turborepo, tRPC
- **Dev3:** Prisma, Database optimization
- **External:** AI stack consultation (LangChain, CrewAI)

### Q&A Sessions

- Daily standup: Quick questions (15 min)
- Weekly deep dive: Complex topics (1 hour)
- On-demand: Slack channel #training-support

---

## Completion Criteria

Training plan is considered complete when:

1. All team members complete required modules
2. Team average confidence >=80%
3. All competency tests passed (>=80% individual)
4. All practical labs delivered and reviewed
5. Follow-up assessment shows knowledge retention >=75%

---

## Appendix: Individual Training Paths

### Dev1 (Senior Full Stack)

- Focus: LangChain Advanced, CrewAI
- Timeline: 1 week
- Mentor role: Next.js, tRPC

### Dev2 (Full Stack Developer)

- Focus: Next.js 16 Deep Dive, AI Stack
- Timeline: 3 weeks
- Support: Tech Lead pairing

### Dev3 (Backend Developer)

- Focus: Next.js 16, Cache Components
- Timeline: 2 weeks
- Mentor role: Prisma

### Dev4 (Frontend Developer)

- Focus: tRPC, AI Integration
- Timeline: 2 weeks
- Support: Dev1 pairing

### Dev5 (DevOps Engineer)

- Focus: AI Stack Overview
- Timeline: 1 week
- Mentor role: Docker, Turborepo

---

**Document Control:**

- Created: 2025-12-26
- Last Updated: 2025-12-26
- Next Review: Sprint 4 Gate (IFC-010)
- Owner: PM + Tech Lead
