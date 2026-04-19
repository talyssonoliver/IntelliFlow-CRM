# IntelliFlow CRM - AI Architecture

**Version:** 2.2.0 **Last Updated:** 2026-04-17 **Owner:** STOA-Intelligence
**Status:** Production Ready (Sprint 17+)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Principles](#design-principles)
3. [System Overview](#system-overview)
4. [Component Architecture](#component-architecture)
5. [Memory Layer (Zep Integration)](#memory-layer-zep-integration)
6. [Tool Definitions](#tool-definitions)
7. [Monitoring & Observability](#monitoring--observability)
8. [Data Flow](#data-flow)
9. [API Contracts](#api-contracts)
10. [Cost Management](#cost-management)
11. [Security Considerations](#security-considerations)
12. [Future Roadmap](#future-roadmap)

---

**Related Diagrams:**

- [LangChain Pipeline Flow Diagram](../history/diagrams/langchain-flow-diagram.mermaid) -
  Visual representation of the complete pipeline

---

## Executive Summary

IntelliFlow CRM's AI architecture is a **Production-Ready Multi-Agent
Ecosystem** built on **LangChain** and **CrewAI**. It is designed to provide
autonomous, context-aware automation across the customer lifecycle, leveraging
**Zep** for memory persistence and **BullMQ** for high-throughput asynchronous
processing.

The system follows strictly **Hexagonal Architecture** principles, ensuring that
LLM orchestration logic (`apps/ai-worker`) remains isolated from domain rules
and infrastructure.

### Key Capabilities

- **Autonomous Agent Fleet**: Specialized agents for Qualification, Email
  Writing, and Next-Best-Action (NBA).
- **Multi-Agent Workflows**: Coordinated agent squads using the **CrewAI**
  framework.
- **Human-in-the-Loop (HITL)**: Mandatory quality gates for high-impact
  decisions.
- **Integrated Quality Guardrails**: Automated Hallucination detection and Model
  Drift monitoring.
- **Cost & ROI Tracking**: Real-time token tracking with daily budgets and
  efficiency reporting.

### Performance Targets

| Metric                     | Target               | Current (v2.1) |
| -------------------------- | -------------------- | -------------- |
| Lead Scoring Latency (p95) | <2s                  | 1.4s           |
| Batch Processing Rate      | 120 leads/min        | 115 leads/min  |
| Cost per Lead Score        | <$0.01               | $0.004         |
| Memory Retrieval Latency   | <100ms               | 85ms           |
| Confidence Threshold       | >0.8 for auto-action | 0.8 (Enforced) |

---

## Design Principles

### 1. Modularity (Hexagonal)

All AI components are designed as **independent, composable units**:

- **Chains**: Single-purpose LangChain pipelines (Scoring, Sentiment, RAG).
- **Agents**: Autonomous actors with specific roles (Qualification, NBA, Email).
- **Tools**: Driving/Driven adapters for CRM interaction (Search, Update,
  Email).
- **Memory**: Persistent context layer via Zep.

### 2. Type Safety

End-to-end type safety using **Zod schemas**:

```typescript
// Input validation
const leadInputSchema = z.object({
  email: z.email(),
  company: z.string().optional(),
  title: z.string().optional(),
});

// Output validation
const scoringResultSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  factors: z.array(factorSchema),
  modelVersion: z.string(),
});
```

All LLM outputs are parsed and validated against Zod schemas before being
returned to the application layer.

### 3. Cost Awareness

Every LLM invocation is tracked:

```typescript
interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  operationType: string;
  timestamp: Date;
}
```

Costs are aggregated daily and compared against configurable limits. When
thresholds are exceeded, alerts are sent and auto-actions are disabled until
reset.

### 4. Human-in-the-Loop

AI outputs include **confidence scores**:

- **Confidence ≥ 0.8**: Auto-execute (high confidence)
- **0.5 ≤ Confidence < 0.8**: Present to user with suggestion
- **Confidence < 0.5**: Require human review

This ensures critical business decisions are validated before execution.

### 5. Hybrid Inference via LiteLLM

All LLM traffic is routed through a **LiteLLM proxy** (see
[ADR-048](./architecture/adr/ADR-048-hybrid-ai-inference.md)) which provides a
single unified endpoint at `http://localhost:4000/v1`. Chain and agent code
speaks only to `ChatOpenAI` with `baseURL = LITELLM_BASE_URL`; the proxy
resolves the concrete model based on the `purpose` and `tier` arguments passed
to `createLLM()` in `apps/ai-worker/src/lib/llm-factory.ts`.

**Three routing tiers:**

| Tier       | Models                                     | Use case                           |
| ---------- | ------------------------------------------ | ---------------------------------- |
| `free`     | Groq, Gemini (non-PII), OpenRouter `:free` | Development, low-stakes scoring    |
| `standard` | Mistral paid, Claude Haiku                 | Standard inference, EU-PII traffic |
| `premium`  | Claude Sonnet, GPT-4o                      | High-confidence, customer-facing   |

**Compliance note — Gemini free tier:** Google's free Gemini tier trains on
prompts. It must not be used with EU-tenant PII and must be gated behind
`NODE_ENV !== 'production'` until the Vertex AI migration is complete.
**Mistral** (France-based, GDPR-native) is the preferred EU-DPA option for
production PII workloads.

**Ollama offline fallback:** Developers without internet access can still run
locally by setting `AI_PROVIDER=ollama`. The required model tag is
`mistral:7b-instruct-q4_K_M`. This path is no longer the primary dev
recommendation; LiteLLM with `free`-tier routing is preferred.

Routing configuration lives in `infra/litellm/config.yaml`. Provider selection
requires no code changes — only the `LITELLM_BASE_URL` environment variable
needs to point at the correct proxy instance.

### 6. Observability

All AI operations are instrumented:

- **Structured Logging**: Pino logger with correlation IDs
- **Metrics**: Prometheus metrics for latency, cost, error rates
- **Tracing**: OpenTelemetry traces for end-to-end visibility
- **Dashboards**: Grafana dashboards for real-time monitoring

---

## System Overview

The `ai-worker` acts as the central orchestration node, consuming tasks from
BullMQ and coordinating between LLM providers and the CRM domain.

```
┌─────────────────────────────────────────────────────────────┐
│                    IntelliFlow CRM AI System                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├── Driving Adapters (Input)
                              │   ├── tRPC API (On-demand tasks)
                              │   └── BullMQ Queues (ai:scoring, ai:prediction)
                              │
                              ├── AI Worker (apps/ai-worker)
                              │   │
                              │   ├── Agent Fleet (CrewAI + LangChain)
                              │   │   ├── QualificationAgent
                              │   │   ├── EmailWriterAgent
                              │   │   ├── NextBestActionAgent
                              │   │   └── Crew Coordinator (crew.ts)
                              │   │
                              │   ├── Chain Library (LangChain)
                              │   │   ├── LeadScoringChain
                              │   │   ├── ChurnRiskChain
                              │   │   └── Sentiment / RAG Chains
                              │   │
                              │   └── Monitoring Service
                              │       ├── DriftDetector
                              │       ├── HallucinationChecker
                              │       └── Latency / ROI Monitors
                              │
                              ├── Driven Adapters (Output)
                              │   ├── LiteLLM Proxy :4000 (unified LLM endpoint)
                              │   │   ├── Groq / Gemini / OpenRouter (free tier)
                              │   │   ├── Mistral / Claude Haiku (standard tier)
                              │   │   ├── Claude Sonnet / GPT-4o (premium tier)
                              │   │   └── Ollama (offline fallback only)
                              │   └── Zep (Conversational Memory)
                              │
                              └── Infrastructure
                                  ├── Supabase (Vector Store / pgvector)
                                  ├── Redis (Job Queue / Cache)
                                  └── Prisma (Metrics Persistence)
```

---

## Component Architecture

### Chains

**Chains** are single-purpose LangChain pipelines that perform a specific task.

#### LeadScoringChain

Scores leads based on profile completeness, engagement indicators, and
qualification signals.

**Location**: `apps/ai-worker/src/chains/scoring.chain.ts`

**Input**:

```typescript
interface LeadInput {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  source: string;
  metadata?: Record<string, unknown>;
}
```

**Output**:

```typescript
interface ScoringResult {
  score: number; // 0-100
  confidence: number; // 0-1
  factors: Array<{
    name: string;
    impact: number;
    reasoning: string;
  }>;
  modelVersion: string;
}
```

**Performance**:

- Target latency: <2s (p95)
- Batch processing: 60 leads/min with rate limiting
- Cost: ~$0.005 per score (GPT-3.5 Turbo)

#### EmbeddingChain

Generates vector embeddings for semantic search.

**Location**: `apps/ai-worker/src/chains/embedding.chain.ts`

#### AutoResponseChain

Generates intelligent, context-aware replies to inbound customer queries with an
integrated human-in-the-loop safety gate.

**Location**: `apps/ai-worker/src/chains/auto-response.chain.ts`

#### ChurnRiskChain

Predicts the probability of customer churn by analyzing activity velocity,
sentiment trends, and support ticket frequency.

**Location**: `apps/ai-worker/src/chains/churn-risk.chain.ts`

#### SentimentChain

Performs fine-grained sentiment analysis on inbound communications to detect
customer frustration or excitement.

**Location**: `apps/ai-worker/src/chains/sentiment.chain.ts`

#### InsightGenerationChain

Synthesizes large volumes of cross-entity data into actionable insights for the
user dashboard.

**Location**: `apps/ai-worker/src/chains/insight-generation.chain.ts`

**Input**:

```typescript
interface EmbeddingInput {
  text: string;
  metadata?: Record<string, unknown>;
}
```

**Output**:

```typescript
interface EmbeddingResult {
  embedding: number[]; // 1536-dim vector (OpenAI)
  model: string;
  tokenCount: number;
}
```

**Performance**:

- Target latency: <500ms
- Batch size: 100 texts/batch
- Cost: ~$0.0001 per embedding

#### SummarizationChain (Future)

Summarizes long conversations or documents.

**Location**: `apps/ai-worker/src/chains/summarization.chain.ts` (TBD)

---

### Agents

**Agents** are autonomous entities that can use tools and make decisions.

#### BaseAgent (Abstract)

All agents extend `BaseAgent` which provides:

- LLM invocation with cost tracking
- Task execution framework
- Confidence calculation
- Error handling and retries
- Statistics tracking

**Location**: `apps/ai-worker/src/agents/base.agent.ts`

**Interface**:

```typescript
abstract class BaseAgent<TInput, TOutput> {
  constructor(config: BaseAgentConfig);

  async execute(
    task: AgentTask<TInput, TOutput>
  ): Promise<AgentResult<TOutput>>;

  protected abstract executeTask(
    task: AgentTask<TInput, TOutput>
  ): Promise<TOutput>;

  protected async calculateConfidence(
    task: AgentTask,
    output: TOutput
  ): Promise<number>;

  protected async invokeLLM(messages: BaseMessage[]): Promise<string>;
}
```

#### QualificationAgent

Qualifies leads by asking clarifying questions and evaluating responses.

**Location**: `apps/ai-worker/src/agents/qualification.agent.ts`

**Role**: "Lead Qualification Specialist"

**Goal**: "Determine if a lead meets our ideal customer profile by gathering and
analyzing key information"

**Tools**:

- CRMSearchTool (search for similar leads)
- CRMUpdateTool (update lead status)

**Workflow**:

1. Analyze lead profile
2. Identify missing information
3. Generate qualification questions
4. Evaluate responses
5. Assign qualification status (Qualified/Unqualified/Needs More Info)

#### EmailWriterAgent

Generates personalized, contextually relevant email drafts for sales and support
interactions.

**Location**: `apps/ai-worker/src/agents/email-writer.agent.ts`

- **Constraints**: Enforces brand voice and tone guidelines.
- **HITL**: Always requires human approval before dispatch.

#### FollowUpAgent

Schedules and executes automated follow-ups based on deal stage transitions and
activity gaps.

**Location**: `apps/ai-worker/src/agents/followup.agent.ts`

#### NextBestActionAgent

Analyzes the entire 360-degree view of a contact or account to recommend the
highest-impact follow-up action.

**Location**: `apps/ai-worker/src/agents/next-best-action.agent.ts`

#### CrewAgent

Coordinates multiple specialized agents using the **CrewAI** framework to
complete high-complexity, multi-step tasks.

**Location**: `apps/ai-worker/src/agents/crew.ts`

---

### Tools

**Tools** are callable functions that agents can use to interact with external
systems.

All tools implement the `LangChain Tool` interface:

```typescript
interface Tool {
  name: string;
  description: string;
  schema: z.ZodSchema;

  _call(input: string): Promise<string>;
}
```

#### CRMSearchTool

Searches the CRM database for leads, contacts, or opportunities.

**Input Schema**:

```typescript
const searchInputSchema = z.object({
  entity: z.enum(['lead', 'contact', 'opportunity', 'task']),
  filters: z.object({
    status: z.array(z.string()).optional(),
    source: z.array(z.string()).optional(),
    score: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
      })
      .optional(),
    createdAfter: z.iso.datetime().optional(),
  }),
  limit: z.number().max(100).default(10),
});
```

**Output**: JSON array of matching entities

#### CRMUpdateTool

Updates CRM entities (leads, contacts, etc.).

**Input Schema**:

```typescript
const updateInputSchema = z.object({
  entity: z.enum(['lead', 'contact', 'opportunity', 'task']),
  id: z.uuid(),
  updates: z.record(z.unknown()),
});
```

**Output**: Updated entity JSON

#### EmailSendTool (Future)

Sends emails via the email service.

---

## Memory Layer (Zep Integration)

**Zep** is a long-term memory store for LLM applications. It provides:

- **Session Management**: Persistent conversation sessions
- **Message History**: Full conversation history with metadata
- **Vector Search**: Semantic search over past conversations
- **Summarization**: Automatic conversation summarization
- **Privacy Controls**: TTL, deletion, and anonymization

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                    │
│  (LeadService, OpportunityService, TaskService)         │
└─────────────────────────────────────────────────────────┘
                        │
                        ├── AI Worker
                        │   ├── Agent.execute(task)
                        │   └── Chain.run(input)
                        │
                        ├── Memory Manager
                        │   ├── getSession(userId, sessionId)
                        │   ├── addMessage(sessionId, message)
                        │   └── searchMemory(sessionId, query)
                        │
                        ├── Zep Client
                        │   ├── REST API
                        │   └── WebSocket (streaming)
                        │
                        └── Zep Server
                            ├── PostgreSQL (metadata)
                            ├── Vector Store (embeddings)
                            └── Redis (cache)
```

### Integration Points

#### 1. Session Creation

When a user starts a conversation or an agent is invoked:

```typescript
import { ZepClient, Session } from '@getzep/zep-js';

const zepClient = new ZepClient({
  apiUrl: process.env.ZEP_API_URL,
  apiKey: process.env.ZEP_API_KEY,
});

// Create session
const session = await zepClient.memory.addSession({
  sessionId: `user-${userId}-${Date.now()}`,
  userId: userId,
  metadata: {
    leadId: lead.id,
    agentName: 'QualificationAgent',
  },
});
```

#### 2. Message Storage

All messages (human and AI) are stored in Zep:

```typescript
await zepClient.memory.addMemory(sessionId, {
  messages: [
    {
      role: 'human',
      content: 'I need help qualifying a lead',
      metadata: { leadId: lead.id },
    },
    {
      role: 'ai',
      content: 'I can help with that. What information do you have?',
      metadata: { confidence: 0.95 },
    },
  ],
});
```

#### 3. Memory Retrieval

Retrieve conversation history for context:

```typescript
// Get recent messages
const memory = await zepClient.memory.getMemory(sessionId, {
  lastn: 10,
});

// Semantic search
const searchResults = await zepClient.memory.searchMemory(sessionId, {
  text: 'lead qualification criteria',
  metadata: { leadId: lead.id },
});
```

#### 4. Conversation Summarization

Zep automatically summarizes long conversations:

```typescript
const session = await zepClient.memory.getSession(sessionId);
const summary = session.summary; // Auto-generated summary

// Use summary as context for new messages
const prompt = `
Previous conversation summary: ${summary}

New message: ${newMessage}
`;
```

### Memory Configuration

```typescript
// apps/ai-worker/src/config/memory.config.ts

export const memoryConfig = {
  zep: {
    apiUrl: process.env.ZEP_API_URL || 'http://localhost:8000',
    apiKey: process.env.ZEP_API_KEY,
  },

  session: {
    ttl: 7 * 24 * 60 * 60, // 7 days
    autoSummarize: true,
    summarizeAfter: 20, // messages
  },

  privacy: {
    enablePII: false, // Redact PII by default
    retentionDays: 90,
  },

  vectorSearch: {
    enabled: true,
    topK: 5,
    scoreThreshold: 0.7,
  },
};
```

### Data Model

#### Session

```typescript
interface ZepSession {
  sessionId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    leadId?: string;
    opportunityId?: string;
    agentName?: string;
  };
  summary?: string;
  facts?: string[];
}
```

#### Message

```typescript
interface ZepMessage {
  uuid: string;
  role: 'human' | 'ai' | 'system';
  content: string;
  createdAt: Date;
  metadata: {
    confidence?: number;
    cost?: number;
    latency?: number;
  };
  tokenCount?: number;
}
```

### Privacy & Compliance

Zep supports:

- **PII Detection**: Automatic redaction of emails, phone numbers, SSNs
- **Data Deletion**: GDPR-compliant deletion of user data
- **Encryption**: At-rest and in-transit encryption
- **Access Controls**: Role-based access to sessions

Configuration:

```typescript
// Enable PII redaction
const session = await zepClient.memory.addSession({
  sessionId: sessionId,
  userId: userId,
  metadata: { pii_redaction: true },
});
```

---

## Tool Definitions

### Tool Interface

All tools extend the base `Tool` class:

```typescript
import { Tool } from '@langchain/core/tools';

class CRMSearchTool extends Tool {
  name = 'crm_search';
  description = 'Search the CRM database for leads, contacts, opportunities, or tasks';

  schema = z.object({
    entity: z.enum(['lead', 'contact', 'opportunity', 'task']),
    filters: z.object({...}),
    limit: z.number().max(100).default(10),
  });

  async _call(input: string): Promise<string> {
    const parsed = this.schema.parse(JSON.parse(input));

    // Execute search via tRPC client
    const results = await trpcClient.${parsed.entity}.search.query({
      filters: parsed.filters,
      limit: parsed.limit,
    });

    return JSON.stringify(results);
  }
}
```

### Available Tools

| Tool Name           | Description         | Input Schema                       | Output         |
| ------------------- | ------------------- | ---------------------------------- | -------------- |
| `crm_search`        | Search CRM entities | `{ entity, filters, limit }`       | JSON array     |
| `crm_update`        | Update CRM entity   | `{ entity, id, updates }`          | Updated entity |
| `crm_create`        | Create CRM entity   | `{ entity, data }`                 | Created entity |
| `email_send`        | Send email          | `{ to, subject, body, template }`  | Email ID       |
| `calendar_schedule` | Schedule event      | `{ title, start, end, attendees }` | Event ID       |

### Tool Authorization

Tools enforce RBAC:

```typescript
async _call(input: string, context: AgentContext): Promise<string> {
  // Check permissions
  const hasPermission = await rbac.hasPermission(
    context.userId,
    'crm:lead:update'
  );

  if (!hasPermission) {
    throw new UnauthorizedError('Insufficient permissions');
  }

  // Execute tool
  // ...
}
```

---

## Data Flow

### Lead Scoring Flow

```
User submits lead form
       ↓
tRPC API receives lead data
       ↓
LeadService.createLead()
       ↓
Emit LeadCreatedEvent
       ↓
AI Worker consumes event
       ↓
LeadScoringChain.scoreLead()
       ├── Format lead info
       ├── Generate prompt
       ├── Call OpenAI API
       ├── Parse structured output
       └── Validate with Zod
       ↓
Cost Tracker records usage
       ↓
Return ScoringResult
       ↓
IF confidence >= 0.8:
  Auto-update lead score
ELSE IF confidence >= 0.5:
  Create approval task
ELSE:
  Flag for manual review
       ↓
Store result in database
       ↓
Notify user via WebSocket
```

### Agent Execution Flow

```
User requests agent action
       ↓
Application layer creates AgentTask
       ↓
Agent.execute(task)
       ├── Load session from Zep
       ├── Retrieve conversation history
       ├── Generate system prompt
       ├── Execute agent logic
       │   ├── Invoke LLM
       │   ├── Parse tool calls
       │   ├── Execute tools
       │   └── Process responses
       ├── Calculate confidence
       └── Store messages in Zep
       ↓
Return AgentResult
       ↓
Application layer processes result
```

---

## API Contracts

### LeadScoringChain

```typescript
class LeadScoringChain {
  /**
   * Score a single lead
   * @throws {ValidationError} Invalid input
   * @throws {LLMError} LLM invocation failed
   */
  async scoreLead(lead: LeadInput): Promise<ScoringResult>;

  /**
   * Score multiple leads in batch
   * @throws {ValidationError} Invalid input
   */
  async scoreLeads(leads: LeadInput[]): Promise<ScoringResult[]>;

  /**
   * Validate scoring result meets quality thresholds
   */
  validateScoringResult(result: ScoringResult): {
    valid: boolean;
    issues: string[];
  };
}
```

### BaseAgent

```typescript
abstract class BaseAgent<TInput, TOutput> {
  /**
   * Execute agent task
   * @returns AgentResult with success, output, confidence
   */
  async execute(
    task: AgentTask<TInput, TOutput>
  ): Promise<AgentResult<TOutput>>;

  /**
   * Get agent statistics
   */
  getStats(): { name: string; role: string; executionCount: number };

  /**
   * Reset agent state
   */
  reset(): void;
}
```

### ZepMemoryManager

```typescript
class ZepMemoryManager {
  /**
   * Create or get session
   */
  async getSession(userId: string, sessionId?: string): Promise<ZepSession>;

  /**
   * Add message to session
   */
  async addMessage(
    sessionId: string,
    role: 'human' | 'ai' | 'system',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Retrieve conversation history
   */
  async getHistory(sessionId: string, lastn?: number): Promise<ZepMessage[]>;

  /**
   * Semantic search over conversation
   */
  async searchMemory(
    sessionId: string,
    query: string,
    topK?: number
  ): Promise<ZepMessage[]>;

  /**
   * Delete session (GDPR compliance)
   */
  async deleteSession(sessionId: string): Promise<void>;
}
```

---

## Cost Management

### Cost Tracking

Every LLM invocation records:

```typescript
interface CostRecord {
  id: string;
  timestamp: Date;
  model: string;
  provider: 'openai' | 'anthropic' | 'groq' | 'gemini' | 'mistral' | 'ollama';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number; // USD
  operationType: string; // 'lead_scoring', 'agent:qualification', etc.
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}
```

### Daily Budget Enforcement

```typescript
class CostTracker {
  private dailyUsage: Map<string, number> = new Map();

  async recordUsage(usage: TokenUsage): Promise<void> {
    const cost = calculateCost(
      usage.model,
      usage.inputTokens,
      usage.outputTokens
    );
    const today = new Date().toISOString().split('T')[0];

    const currentUsage = this.dailyUsage.get(today) || 0;
    const newUsage = currentUsage + cost;

    this.dailyUsage.set(today, newUsage);

    // Check against limits
    if (newUsage > aiConfig.costTracking.dailyLimit) {
      await this.sendAlert({
        type: 'DAILY_LIMIT_EXCEEDED',
        limit: aiConfig.costTracking.dailyLimit,
        actual: newUsage,
      });

      throw new CostLimitExceededError('Daily cost limit exceeded');
    }

    // Warning threshold
    if (newUsage > aiConfig.costTracking.warningThreshold) {
      await this.sendAlert({
        type: 'WARNING_THRESHOLD',
        threshold: aiConfig.costTracking.warningThreshold,
        actual: newUsage,
      });
    }
  }
}
```

### Cost Optimization Strategies

1. **LiteLLM Free-Tier Routing**: Non-PII, non-production work defaults to
   Groq/Gemini/OpenRouter free-tier models via the `free` tier — zero token cost
   for the bulk of development and testing.
2. **Tier Selection in `createLLM()`**: Pass `tier: 'free'` for low-stakes
   operations; the proxy handles routing without code changes.
3. **Caching**: Cache embeddings and common LLM responses
4. **Prompt Engineering**: Minimize token usage with concise prompts
5. **Batch Processing**: Combine multiple requests when possible
6. **Rate Limiting**: Prevent runaway costs from bugs/attacks

---

## Monitoring & Observability

### Metrics

Prometheus metrics exposed at `/metrics`:

```typescript
// Latency histogram
ai_operation_duration_seconds{
  operation="lead_scoring",
  model="gpt-3.5-turbo",
  success="true"
}

// Token usage counter
ai_tokens_total{
  model="gpt-3.5-turbo",
  type="input"
}

// Cost gauge
ai_cost_daily_usd{
  provider="openai"
}

// Error rate
ai_errors_total{
  operation="lead_scoring",
  error_type="LLMError"
}

// Confidence distribution
ai_confidence_score{
  operation="lead_scoring",
  quantile="0.95"
}
```

### Logging

Structured logging with correlation IDs:

```json
{
  "level": "info",
  "time": "2025-12-31T03:36:53.761Z",
  "name": "scoring-chain",
  "correlationId": "req-abc123",
  "leadEmail": "john@example.com",
  "score": 85,
  "confidence": 0.92,
  "duration": 1234,
  "msg": "Lead scoring completed"
}
```

### Dashboards

Grafana dashboards:

1. **AI Operations Overview**
   - Total invocations
   - Success rate
   - Average latency (p50, p95, p99)
   - Daily cost trend

2. **Model Performance**
   - Latency by model
   - Token usage by model
   - Error rate by model

3. **Cost Analytics**
   - Daily cost by operation type
   - Cost per user
   - Projected monthly cost

4. **Agent Activity**
   - Agent execution count
   - Confidence score distribution
   - Tool usage frequency

---

## Security Considerations

### 1. API Key Management

- **Never commit API keys**: Use environment variables
- **Vault integration**: Store keys in HashiCorp Vault (EXC-SEC-001)
- **Key rotation**: Rotate keys every 90 days
- **Least privilege**: Use separate keys for dev/staging/prod

### 2. Input Validation

All inputs are validated with Zod before LLM invocation:

```typescript
const validatedInput = leadInputSchema.parse(rawInput);
```

This prevents prompt injection and ensures type safety.

### 3. Output Sanitization

LLM outputs are sanitized before rendering:

```typescript
import DOMPurify from 'isomorphic-dompurify';

const sanitized = DOMPurify.sanitize(llmOutput);
```

### 4. Rate Limiting

Rate limiting prevents abuse:

```typescript
// Per-user rate limit
const rateLimiter = new RateLimiter({
  points: 60, // 60 requests
  duration: 60, // per minute
});

await rateLimiter.consume(userId);
```

### 5. Data Privacy

- **PII Redaction**: Zep automatically redacts PII
- **Data Retention**: Conversations deleted after 90 days
- **GDPR Compliance**: Users can request data deletion
- **Encryption**: All data encrypted at rest and in transit

### 6. Model Security

- **Prompt Injection Protection**: Validate and sanitize all inputs
- **Output Validation**: Ensure outputs match expected schemas
- **Hallucination Detection**: Flag low-confidence results
- **Bias Monitoring**: Track and audit for bias in scoring

---

## Design Decisions

### Tool Selection is Rule-Based, Not LLM `tool_choice`

**Tool selection is rule-based, not LLM `tool_choice`.** Callers (tRPC
resolvers, workflow orchestrators) look up tools by name via
`agentToolRegistry.get()` / `getForTenant()`. Rationale: (1) deterministic audit
trail — every tool invocation is explicitly initiated by named code, not an
LLM's decision; (2) approval middleware
([ADR-006](./adr/ADR-006-agent-approval-middleware.md)) depends on knowing
_which_ tool will run before invocation; (3) simpler security surface — no
prompt-injection path to tool escalation; (4) unchanged from initial ADR-006
adoption. Migration to LLM `tool_choice` would be a substantial rework and is
out of scope until agent-planning
([ADR-049](./adr/ADR-049-agent-plan-reflect-phases.md)) matures.

---

## Future Roadmap

### Phase 2: Multi-Agent Workflows (Sprint 13-15)

- **Agent Coordination**: Multiple agents collaborating on tasks
- **LangGraph Integration**: Visual workflow orchestration
- **Human-in-the-Loop UI**: Review interface for low-confidence results

### Phase 3: Advanced AI Features (Sprint 16-20)

- **RAG (Retrieval Augmented Generation)**: Search over knowledge base
- **Custom Fine-Tuning**: Fine-tune models on CRM data
- **Predictive Analytics**: Revenue forecasting, churn prediction
- **Sentiment Analysis**: Analyze email sentiment

### Phase 4: Production Hardening (Sprint 21-25)

- **A/B Testing**: Compare model versions
- **Model Monitoring**: Drift detection, performance degradation
- **Guardrails**: Safety checks for production LLMs
- **Disaster Recovery**: Fallback strategies for LLM outages

---

## Appendix A: Environment Variables

```bash
# LLM Provider — primary path
AI_PROVIDER=litellm                 # default; routes via LiteLLM proxy
LITELLM_BASE_URL=http://localhost:4000/v1

# Ollama — offline fallback only
# AI_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=mistral:7b-instruct-q4_K_M
# OLLAMA_TEMPERATURE=0.7

# OpenAI (used by LiteLLM proxy internally for premium tier)
OPENAI_API_KEY=sk-...
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=2000
OPENAI_TIMEOUT=30000

# Zep Memory
ZEP_API_URL=http://localhost:8000
ZEP_API_KEY=zep-...

# Cost Tracking
COST_TRACKING_ENABLED=true
COST_WARNING_THRESHOLD=10          # USD
COST_DAILY_LIMIT=50                # USD

# Performance
AI_CACHE_ENABLED=true
AI_CACHE_TTL=3600                  # seconds
AI_RATE_LIMIT=60                   # per minute
AI_RETRY_ATTEMPTS=3
AI_RETRY_DELAY=1000                # ms

# Feature Flags
ENABLE_CHAIN_LOGGING=true
ENABLE_CONFIDENCE_SCORES=true
ENABLE_STRUCTURED_OUTPUTS=true
ENABLE_MULTI_AGENT=false

# Logging
LOG_LEVEL=info
```

---

## Appendix B: File Structure

```
apps/ai-worker/
├── src/
│   ├── chains/
│   │   ├── scoring.chain.ts
│   │   ├── embedding.chain.ts
│   │   └── summarization.chain.ts (future)
│   │
│   ├── agents/
│   │   ├── base.agent.ts
│   │   ├── qualification.agent.ts
│   │   ├── email.agent.ts (future)
│   │   └── followup.agent.ts (future)
│   │
│   ├── tools/
│   │   ├── crm-search.tool.ts
│   │   ├── crm-update.tool.ts
│   │   ├── email-send.tool.ts (future)
│   │   └── calendar.tool.ts (future)
│   │
│   ├── memory/
│   │   ├── zep-manager.ts
│   │   └── memory.config.ts
│   │
│   ├── config/
│   │   └── ai.config.ts
│   │
│   ├── utils/
│   │   ├── cost-tracker.ts
│   │   ├── logger.ts
│   │   └── retry.ts
│   │
│   ├── monitoring/
│   │   ├── roi-tracker.ts
│   │   ├── latency-monitor.ts
│   │   ├── drift-detector.ts
│   │   └── hallucination-checker.ts
│   │
│   └── index.ts
│
└── tests/
    ├── chains/
    ├── agents/
    ├── tools/
    └── integration/
```

---

## Appendix C: Dependencies

```json
{
  "dependencies": {
    "@langchain/core": "^0.1.0",
    "@langchain/openai": "^0.0.19",
    "@langchain/community": "^0.0.20",
    "@getzep/zep-js": "^0.9.0",
    "zod": "^3.22.4",
    "pino": "^8.16.0",
    "ioredis": "^5.3.2"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "vitest": "^1.0.0"
  }
}
```

---

**Document Status**: Design Approved **Next Review**: Sprint 13 **Maintainer**:
STOA-Intelligence **Approvers**: Tech Lead, Security Lead, Architecture Lead
