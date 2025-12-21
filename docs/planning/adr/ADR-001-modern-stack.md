# ADR-001: Modern AI-First Technology Stack

**Status:** Accepted

**Date:** 2025-12-20

**Deciders:** CTO, Tech Lead, Architecture Team

**Technical Story:** IFC-001 - Technical Architecture Spike - Modern Stack

## Context and Problem Statement

IntelliFlow CRM is being built as an AI-native CRM system that emphasizes automation, type safety, and developer productivity. We need to select a modern technology stack that enables rapid AI-assisted development while maintaining production-grade quality, performance, and maintainability. How should we architect our technology stack to maximize AI integration, type safety, and development velocity?

## Decision Drivers

- **End-to-end Type Safety**: Prevent runtime errors through compile-time validation across the entire stack (database → backend → frontend)
- **AI-First Architecture**: Enable seamless integration with LLMs (OpenAI, Ollama), vector databases, and agent frameworks
- **Developer Productivity**: Optimize for AI-assisted coding with tools like Claude Code and GitHub Copilot
- **Monorepo Scalability**: Support multiple applications and shared packages with efficient build caching
- **Performance Targets**: API response time p95 < 100ms, p99 < 200ms; Frontend FCP < 1s
- **Modern Tooling**: Leverage cutting-edge tools that improve DX without sacrificing stability
- **Cost Optimization**: Minimize infrastructure costs while maintaining quality
- **Production Readiness**: Battle-tested technologies with strong community support

## Considered Options

- **Option 1**: Modern TypeScript Stack (Turborepo, tRPC, Prisma, Next.js 16, Supabase, LangChain)
- **Option 2**: Traditional Stack (Express.js, REST API, TypeORM, React SPA, MySQL, Custom AI)
- **Option 3**: Enterprise Stack (NestJS, GraphQL, TypeORM, Angular, AWS RDS, AWS Lambda)
- **Option 4**: Serverless-First (Vercel Functions, GraphQL, Prisma, Next.js, PlanetScale, OpenAI Functions)

## Decision Outcome

Chosen option: **"Modern TypeScript Stack"** (Option 1), because it provides the best combination of type safety, AI integration, developer experience, and performance while maintaining production readiness. This stack enables end-to-end type safety without code generation, seamless AI/LLM integration, and optimal DX for AI-assisted development.

### Positive Consequences

- **Complete Type Safety**: TypeScript types flow from database schema (Prisma) → API (tRPC) → frontend (Next.js) without manual synchronization
- **Zero Code Generation**: tRPC provides type safety without build steps for API contracts (Prisma generates only database client)
- **Exceptional DX**: Autocomplete, IntelliSense, and refactoring work perfectly across the entire stack
- **AI Integration**: LangChain ecosystem provides rich tools for LLM chains, agents, and RAG; Supabase pgvector enables semantic search
- **Fast Builds**: Turborepo caching reduces build times from minutes to seconds for incremental changes
- **Modern Features**: Next.js 16 App Router, Server Components, and streaming; React 19 latest features
- **Vector Search**: Native pgvector support in Supabase enables semantic search and embeddings without additional infrastructure
- **Cost Effective**: Supabase free tier + Railway/Vercel provides generous limits; Ollama for local LLM development reduces API costs
- **Proven at Scale**: All components are used in production by major companies (Vercel, Cal.com, Supabase, Anthropic)
- **Future-Proof**: Active development, strong community, modern patterns (RSC, streaming, AI agents)

### Negative Consequences

- **TypeScript Only**: Stack is TypeScript-centric; not suitable for non-TS teams (acceptable for our use case)
- **Smaller Ecosystems**: tRPC and LangChain have smaller ecosystems than REST/GraphQL and traditional ML frameworks
- **Rapid Evolution**: Some components (Next.js App Router, LangChain) are evolving quickly, requiring occasional updates
- **Learning Curve**: Team must learn modern patterns (hexagonal architecture, DDD, tRPC, Server Components)
- **Vendor Dependencies**: Supabase (PostgreSQL), Vercel/Railway (hosting) create some lock-in (mitigated by using Prisma and standard PostgreSQL)
- **AI Framework Maturity**: LangChain API changes frequently; requires version pinning and careful upgrades

## Pros and Cons of the Options

### Option 1: Modern TypeScript Stack (CHOSEN)

**Stack Components:**
- **Monorepo**: Turborepo with pnpm workspaces
- **Backend**: tRPC for type-safe APIs, Prisma ORM
- **Frontend**: Next.js 16.0.10 (App Router), React 19, Tailwind CSS, shadcn/ui
- **Database**: Supabase (PostgreSQL 15 + pgvector + Auth + Realtime)
- **AI/LLM**: LangChain, CrewAI agents, OpenAI API, Ollama (local dev)
- **Infrastructure**: Docker Compose (local), Railway/Vercel (production)
- **Observability**: OpenTelemetry, Prometheus, Grafana

**Pros:**
- ✅ End-to-end type safety without code generation (TypeScript → Prisma → tRPC → React)
- ✅ Excellent DX with IntelliSense, autocomplete, and refactoring
- ✅ Fast builds with Turborepo caching (3-5x faster than without caching)
- ✅ Native vector search with pgvector (no separate vector DB needed)
- ✅ Rich AI ecosystem (LangChain chains, CrewAI multi-agent, OpenAI/Ollama)
- ✅ Modern React patterns (Server Components, streaming, suspense)
- ✅ Built-in authentication and RLS with Supabase
- ✅ Cost-effective for startups (generous free tiers)
- ✅ Optimized for AI-assisted coding (Claude Code, Copilot work exceptionally well)
- ✅ Strong community and active development

**Cons:**
- ❌ TypeScript-only (not suitable for polyglot teams)
- ❌ LangChain API evolves rapidly (requires version management)
- ❌ Smaller ecosystem than REST/GraphQL
- ❌ Supabase vendor dependency (mitigated by Prisma abstraction)
- ❌ Learning curve for modern patterns (App Router, RSC, DDD)

### Option 2: Traditional Stack (Express + REST + TypeORM)

**Stack Components:**
- Express.js, REST API with OpenAPI/Swagger, TypeORM, React SPA (Vite), MySQL, Custom AI integration

**Pros:**
- ✅ Well-established patterns, large ecosystem
- ✅ Extensive documentation and tutorials
- ✅ Easy to find developers familiar with stack
- ✅ Language-agnostic API (REST supports any client)

**Cons:**
- ❌ No compile-time type safety across API boundary
- ❌ Requires code generation for TypeScript types (OpenAPI codegen)
- ❌ Manual synchronization of API contracts and types
- ❌ Slower development velocity (more boilerplate)
- ❌ Poor AI integration (no native vector search, custom LLM setup)
- ❌ Less optimized for AI-assisted development
- ❌ Higher maintenance burden (manual type sync, API versioning)
- ❌ No monorepo optimization (slower builds)

### Option 3: Enterprise Stack (NestJS + GraphQL + Angular)

**Stack Components:**
- NestJS, GraphQL with Apollo, TypeORM, Angular, AWS RDS (PostgreSQL), AWS Lambda for AI

**Pros:**
- ✅ Enterprise-grade architecture with decorators and modules
- ✅ GraphQL provides flexible querying
- ✅ Strong typing with GraphQL Codegen
- ✅ AWS ecosystem integration
- ✅ Suitable for large teams with strict governance

**Cons:**
- ❌ Heavy framework overhead (NestJS adds complexity)
- ❌ GraphQL requires code generation for full type safety
- ❌ Angular has steeper learning curve than React
- ❌ Larger bundle sizes (GraphQL client, Angular framework)
- ❌ AWS costs higher than alternatives
- ❌ Slower DX (compilation times, boilerplate)
- ❌ Less AI-native (no built-in vector search, LLM integration)
- ❌ Overkill for startup/small team

### Option 4: Serverless-First (Vercel Functions + GraphQL)

**Stack Components:**
- Vercel Edge Functions, GraphQL with Pothos, Prisma, Next.js, PlanetScale (MySQL), OpenAI Functions

**Pros:**
- ✅ Zero infrastructure management
- ✅ Automatic scaling
- ✅ Global edge distribution
- ✅ Next.js + Vercel integration is excellent
- ✅ Pay-per-use pricing (cost-effective at low scale)

**Cons:**
- ❌ Serverless cold starts (latency spikes)
- ❌ PlanetScale pricing expensive at scale
- ❌ No native vector search in MySQL (requires separate Pinecone/Weaviate)
- ❌ Vendor lock-in (Vercel, PlanetScale)
- ❌ Limited control over infrastructure
- ❌ Debugging complexity (distributed tracing required)
- ❌ Cost unpredictability at scale

## Technology Breakdown

### Monorepo: Turborepo + pnpm

**Why Turborepo?**
- Remote caching reduces CI build times by 3-5x
- Task parallelization and dependency management
- Incremental builds (only rebuild what changed)
- Excellent DX with `turbo run dev` for all apps

**Why pnpm?**
- Faster than npm/yarn (content-addressable store)
- Disk space efficient (shared dependencies)
- Strict dependency resolution (no phantom dependencies)
- Native workspace support

**Validation:**
```bash
# Build time without cache: ~180s
# Build time with cache: ~35s (5x improvement)
pnpm run build  # Builds all apps/packages with Turborepo
```

### API: tRPC 11.8.0

**Why tRPC over REST/GraphQL?**
- End-to-end type safety without code generation
- Automatic client generation with perfect TypeScript types
- Minimal runtime overhead (<5ms vs GraphQL)
- Perfect for monorepos (shared types between client/server)
- Built-in subscriptions via WebSockets

**Type Safety Validation:**
```typescript
// Server defines router
export const leadRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return prisma.lead.findUnique({ where: { id: input.id } });
    }),
});

// Client gets automatic types
const lead = await trpc.lead.getById.query({ id: "123" });
// TypeScript knows exact shape of `lead` - no manual typing needed
```

**Performance:**
- Request parsing: <1ms (Zod validation)
- Type overhead: 0ms (compile-time only)
- Serialization: <2ms (JSON.stringify)
- **Total overhead: <5ms** (well under 50ms target)

### Database: Prisma 5.x + Supabase

**Why Prisma?**
- Type-safe database client generated from schema
- Excellent migration workflow
- Query optimization and relation loading
- Introspection and Prisma Studio for debugging

**Why Supabase over self-hosted PostgreSQL?**
- PostgreSQL 15 + pgvector extension (semantic search)
- Built-in authentication (JWT-based)
- Row Level Security (RLS) for authorization
- Real-time subscriptions (WebSocket-based)
- Auto-generated REST API (optional, we use tRPC)
- Generous free tier (500MB DB, 50,000 auth users)

**Type Safety Validation:**
```typescript
// Prisma schema defines models
model Lead {
  id        String   @id @default(cuid())
  email     String
  score     Int      @default(0)
  embedding Unsupported("vector(1536)")?
}

// Generated client has perfect types
const lead = await prisma.lead.findUnique({
  where: { id: "123" },
  select: { email: true, score: true },
});
// TypeScript infers: { email: string; score: number }
```

**Vector Search (pgvector):**
```sql
-- Semantic search using embeddings
SELECT id, email, 1 - (embedding <=> '[0.1, 0.2, ...]') AS similarity
FROM leads
ORDER BY embedding <=> '[0.1, 0.2, ...]'
LIMIT 10;
```

**Performance:**
- Simple queries: <10ms (indexed lookups)
- Complex joins: <50ms (optimized with Prisma)
- Vector similarity search: <100ms (with HNSW index)

### Frontend: Next.js 16.0.10 + React 19

**Why Next.js 16 App Router?**
- Server Components reduce client bundle size by ~40%
- Streaming and Suspense for progressive rendering
- File-based routing with layouts and templates
- Built-in optimizations (image, font, script)
- API routes for tRPC endpoints

**Why React 19?**
- Latest features (use, Server Actions, transitions)
- Better Suspense and streaming support
- Improved performance and smaller bundle size

**Component Library: shadcn/ui + Tailwind CSS**
- Accessible components (WCAG 2.1 AA)
- Customizable with Tailwind (no runtime CSS-in-JS)
- Copy-paste approach (no dependency bloat)
- Excellent DX with VS Code Tailwind extension

**Performance Targets:**
- First Contentful Paint (FCP): <1s
- Time to Interactive (TTI): <2s
- Lighthouse Score: >90
- Bundle size: <200KB (gzipped)

### AI/LLM: LangChain + CrewAI + OpenAI/Ollama

**Why LangChain?**
- Rich ecosystem for LLM chains and agents
- Structured outputs with Zod schemas
- Streaming support for real-time responses
- Memory and state management
- RAG (Retrieval-Augmented Generation) tools

**Why CrewAI?**
- Multi-agent collaboration (lead qualification, email generation)
- Role-based agents with specific tools
- Task delegation and orchestration

**Why OpenAI + Ollama?**
- **OpenAI (Production)**: GPT-4o for high-quality outputs, embeddings
- **Ollama (Development)**: Local LLMs (Llama 3, Mistral) for cost-free testing

**AI Integration Example:**
```typescript
// LangChain chain with structured output
const scoringChain = new LLMChain({
  llm: new ChatOpenAI({ model: "gpt-4o" }),
  prompt: scoringPromptTemplate,
  outputParser: StructuredOutputParser.fromZodSchema(leadScoreSchema),
});

const result = await scoringChain.call({ lead });
// result.score: number (0-100)
// result.factors: { engagement: number; fit: number; intent: number }
```

**Performance:**
- AI Scoring: <2s per lead (includes API latency)
- Embedding Generation: <500ms per document
- Multi-agent workflows: <5s for complex tasks

### Infrastructure: Docker + Railway/Vercel

**Local Development:**
- Docker Compose for PostgreSQL, Redis, Ollama
- Supabase CLI for local database with migrations
- pnpm for package management
- Turborepo for build orchestration

**Production:**
- **Frontend**: Vercel (Next.js optimized, edge functions, CDN)
- **API**: Railway (containerized tRPC server, auto-scaling)
- **Database**: Supabase (managed PostgreSQL with pgvector)
- **Cache**: Upstash Redis (serverless Redis)
- **Monitoring**: Sentry (errors), Grafana Cloud (metrics)

### Observability: OpenTelemetry + Prometheus + Grafana

**Why OpenTelemetry?**
- Vendor-neutral instrumentation
- Automatic tracing for HTTP, database, external APIs
- Custom metrics and spans
- Distributed tracing across services

**Metrics Tracked:**
- API response times (p50, p95, p99)
- Database query performance
- AI scoring latency and cost
- Error rates and types
- User engagement metrics

## Performance Validation

### Type Safety Validation

**Test**: Verify end-to-end type safety by intentionally breaking types and confirming TypeScript errors.

```typescript
// ✅ VALID: Types flow correctly
const lead = await prisma.lead.findUnique({ where: { id: "123" } });
const score = await trpc.lead.score.mutate({ leadId: lead.id });
// TypeScript knows: lead has id, email, score; score is number

// ❌ INVALID: TypeScript catches error at compile time
const score = await trpc.lead.score.mutate({ wrongField: "oops" });
// Error: Argument of type '{ wrongField: string }' is not assignable
```

**Result**: ✅ Type safety validated - all type errors caught at compile time.

### Latency Validation

**Benchmark Results** (see `artifacts/benchmarks/performance-benchmark.json`):

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| Simple tRPC query (getById) | <50ms | 12ms | ✅ Pass |
| Complex query (with relations) | <50ms | 28ms | ✅ Pass |
| Database query (indexed) | <20ms | 8ms | ✅ Pass |
| Prisma type generation | N/A | 0ms (compile-time) | ✅ Pass |
| tRPC type overhead | <5ms | 0ms (compile-time) | ✅ Pass |
| Full stack request (DB→API→Client) | <100ms | 45ms | ✅ Pass |

**Key Findings:**
- All components connectable: ✅ Validated
- Type safety: ✅ Validated (compile-time errors caught)
- Latency: ✅ Validated (<50ms, well under target)

### Connection Validation

**Tested Integrations:**
1. ✅ Prisma → PostgreSQL (Supabase): Migrations applied, schema introspection working
2. ✅ tRPC → Prisma: Type-safe queries executing correctly
3. ✅ Next.js → tRPC: Client hooks generating with perfect types
4. ✅ Turborepo: Builds cached and parallelized correctly
5. ✅ pgvector: Embeddings stored and queried successfully

## Implementation Notes

### Setup Requirements

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Database setup:**
   ```bash
   # Initialize Supabase locally
   supabase init
   supabase start

   # Generate Prisma client and run migrations
   pnpm run db:generate
   pnpm run db:migrate
   ```

3. **Development:**
   ```bash
   # Start all apps in parallel
   pnpm run dev

   # Or start individual apps
   pnpm --filter web dev       # Next.js frontend
   pnpm --filter api dev       # tRPC API
   pnpm --filter ai-worker dev # AI worker
   ```

4. **Type checking:**
   ```bash
   pnpm run typecheck  # Verify types across entire monorepo
   ```

### Validation Criteria

- [x] All stack components installed and connected
- [x] Type safety validated (TypeScript errors caught at compile time)
- [x] Latency targets met (<50ms for API, <20ms for DB queries)
- [x] Monorepo builds working with Turborepo caching
- [x] Database migrations running with Prisma + Supabase
- [x] tRPC client generating types correctly
- [x] Next.js 16 App Router working with Server Components
- [x] Vector search functional with pgvector
- [x] Performance benchmark created and passing

### Migration Path

If we need to migrate from this stack in the future:

1. **Database (Prisma + Supabase → Other)**:
   - Prisma abstracts PostgreSQL - can migrate to any Postgres provider
   - Export data via `pg_dump` or Prisma seed scripts
   - pgvector is standard extension - portable to any Postgres 11+

2. **API (tRPC → REST/GraphQL)**:
   - Keep domain/application layers (DDD architecture)
   - Replace tRPC routers with Express/Fastify + OpenAPI
   - Use Zod schemas to generate OpenAPI types
   - Estimated effort: 2-3 weeks for full migration

3. **Frontend (Next.js → Other React Framework)**:
   - React components are portable (standard JSX/TSX)
   - Replace tRPC client with REST/GraphQL client
   - Keep UI components (shadcn/ui works with any React framework)
   - Estimated effort: 1-2 weeks

4. **AI (LangChain → Other)**:
   - Abstract AI services behind ports (hexagonal architecture)
   - Replace LangChain with LlamaIndex, direct OpenAI, or custom
   - Keep prompts and business logic
   - Estimated effort: 1-2 weeks

### Rollback Plan

If the modern stack proves problematic during Sprint 1-4:

1. Maintain current architecture but simplify:
   - Keep Prisma + PostgreSQL (stable and proven)
   - Replace tRPC with REST API + OpenAPI/Swagger
   - Keep Next.js but use Pages Router (more stable)
   - Replace LangChain with direct OpenAI API calls

2. Triggers for rollback consideration:
   - Type safety causing more bugs than preventing (unlikely)
   - tRPC limitations blocking critical features
   - LangChain instability impacting development velocity
   - Team unable to learn modern patterns within sprint timeline

3. Decision gate: IFC-010 (Sprint 4) - Phase 1 Go/No-Go
   - Review: Stack productivity, bug rates, developer satisfaction
   - Metrics: Build times, development velocity, time to implement features
   - If metrics fail to meet targets, evaluate rollback or adjustments

## Links

- [tRPC Documentation](https://trpc.io)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [LangChain Documentation](https://js.langchain.com/docs)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Architecture Overview](../../architecture/overview.md)
- [Sprint Plan Task: IFC-001](../../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [Performance Benchmark](../../../artifacts/benchmarks/performance-benchmark.json)
- [Architecture Spike POC](../../../artifacts/misc/architecture-spike/)

## References

- Hexagonal Architecture: [Alistair Cockburn](https://alistair.cockburn.us/hexagonal-architecture/)
- Domain-Driven Design: [Martin Fowler](https://martinfowler.com/tags/domain%20driven%20design.html)
- Type-Safe APIs: [tRPC vs GraphQL vs REST](https://trpc.io/docs/concepts)
- Modern React: [React Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- AI Integration: [LangChain Concepts](https://js.langchain.com/docs/concepts)

---

**Conclusion**: The modern TypeScript stack (Turborepo, tRPC, Prisma, Next.js 16, Supabase, LangChain) provides the optimal foundation for IntelliFlow CRM. It delivers on all key requirements: end-to-end type safety, AI-first architecture, exceptional DX, and performance targets. The stack is production-ready, cost-effective, and future-proof, with clear migration paths if needed.

**Status**: ✅ Architecture spike validated. Ready to proceed with Sprint 1 implementation.
