# Context Pack: IFC-020 – LangChain Pipeline Design

**Task ID:** IFC-020
**Sprint:** 12
**Section:** Intelligence
**Owner:** AI Specialist + Data Scientist (STOA-Intelligence)
**Created:** 2025-12-31

## Task Overview

Design a modular AI pipeline with memory (Zep) and tools defined. This task establishes the foundation for IntelliFlow CRM's AI capabilities by creating a LangChain-based architecture that supports:

- Conversational memory with Zep
- Modular tool/chain design
- Human-in-the-loop workflows
- Cost tracking and monitoring
- Multi-agent coordination (future)

## Pre-requisites Acknowledged

### Files Read

1. **artifacts/sprint0/codex-run/Framework.md**
   - STOA framework v4.3 FINAL
   - Governance model for task execution
   - Evidence-based completion criteria
   - Gate profiles and validation requirements

2. **audit-matrix.yml**
   - Canonical tool matrix for system audits
   - Tier 1 blockers: typecheck, build, test coverage, lint
   - Security gates: gitleaks, pnpm-audit, snyk, semgrep, trivy
   - Quality gates: mutation testing, lighthouse, SonarQube

3. **docs/company/brand/visual-identity.md**
   - Visual identity guidelines
   - Color system, typography, spacing
   - Design tokens and component patterns
   - Accessibility requirements

4. **apps/ai-worker/src/chains/scoring.chain.ts** (120 line excerpt)
   - Existing LangChain implementation for lead scoring
   - StructuredOutputParser pattern with Zod schemas
   - Cost tracking integration
   - Error handling and confidence scores

```typescript
// Excerpt: LeadScoringChain constructor
constructor() {
  if (aiConfig.provider === 'openai') {
    this.model = new ChatOpenAI({
      modelName: aiConfig.openai.model,
      temperature: aiConfig.openai.temperature,
      maxTokens: aiConfig.openai.maxTokens,
      timeout: aiConfig.openai.timeout,
      openAIApiKey: aiConfig.openai.apiKey,
      callbacks: aiConfig.features.enableChainLogging
        ? [
            {
              handleLLMEnd: async (output) => {
                const usage = output.llmOutput?.tokenUsage;
                if (usage && aiConfig.costTracking.enabled) {
                  costTracker.recordUsage({
                    model: aiConfig.openai.model,
                    inputTokens: usage.promptTokens || 0,
                    outputTokens: usage.completionTokens || 0,
                    operationType: 'lead_scoring',
                  });
                }
              },
            },
          ]
        : undefined,
    });
  }

  this.parser = StructuredOutputParser.fromZodSchema(leadScoreSchema);

  this.prompt = new PromptTemplate({
    template: `You are an expert lead scoring AI...`,
    inputVariables: ['lead_info'],
    partialVariables: {
      format_instructions: this.parser.getFormatInstructions(),
    },
  });
}
```

5. **apps/ai-worker/src/agents/base.agent.ts** (120 line excerpt)
   - BaseAgent abstract class pattern
   - AgentTask and AgentResult interfaces
   - Confidence calculation framework
   - LLM invocation with cost tracking

```typescript
// Excerpt: BaseAgent execution pattern
async execute(task: AgentTask<TInput, TOutput>): Promise<AgentResult<TOutput>> {
  const startTime = Date.now();
  this.executionCount++;

  try {
    // Execute the agent's specific logic
    const output = await this.executeTask(task);

    // Validate output if schema provided
    if (task.expectedOutput) {
      task.expectedOutput.parse(output);
    }

    const duration = Date.now() - startTime;
    const confidence = await this.calculateConfidence(task, output);

    return {
      success: true,
      output,
      confidence,
      timestamp: new Date(),
      duration,
      metadata: {
        agentName: this.config.name,
        executionCount: this.executionCount,
        taskId: task.id,
      },
    };
  } catch (error) {
    // Error handling with full context
  }
}
```

6. **apps/ai-worker/src/config/ai.config.ts** (120 line excerpt)
   - AI provider configuration (OpenAI/Ollama)
   - Cost tracking settings
   - Performance tuning (cache, rate limits, retries)
   - Feature flags for chain logging, confidence scores

```typescript
// Excerpt: Configuration schema
export const AIConfigSchema = z.object({
  provider: AIProviderSchema.default('openai'),

  openai: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('gpt-4-turbo-preview'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(2000),
    timeout: z.number().positive().default(30000),
  }),

  costTracking: z.object({
    enabled: z.boolean().default(true),
    warningThreshold: z.number().positive().default(10),
    dailyLimit: z.number().positive().optional(),
  }),

  features: z.object({
    enableChainLogging: z.boolean().default(true),
    enableConfidenceScores: z.boolean().default(true),
    enableStructuredOutputs: z.boolean().default(true),
    enableMultiAgentWorkflows: z.boolean().default(false),
  }),
});
```

## Environment Requirements

- **LangChain patterns researched**: ✅ Confirmed from existing codebase
- **Prompts tested**: ✅ Lead scoring prompt validated in scoring.chain.ts
- **Zep integration planned**: Memory persistence layer for conversation history
- **Tool definitions**: To be formalized in ai-architecture.md

## Invariants Acknowledged

1. **Modular Architecture**: All AI components must follow hexagonal architecture with clear boundaries between domain, application, and adapters layers

2. **Type Safety**: All LLM inputs/outputs must use Zod schemas for validation and TypeScript type generation

3. **Cost Control**: Every LLM invocation must track tokens and costs, with configurable daily limits and warning thresholds

4. **Human-in-the-Loop**: AI outputs must include confidence scores, allowing human override when confidence < 0.5

5. **Memory Persistence**: Zep will provide conversation memory across sessions, with TTL and privacy controls

6. **Error Resilience**: All chains must implement retry logic (3 attempts default) with exponential backoff

7. **Observability**: Chain execution must be logged with correlation IDs, duration, and token usage

8. **Provider Flexibility**: Architecture must support switching between OpenAI (production) and Ollama (local dev)

9. **Structured Outputs**: All agent responses must use StructuredOutputParser to ensure consistent, parseable results

10. **Performance Targets**: AI scoring <2s per lead (p95), batch operations with rate limiting to avoid provider throttling

## Dependencies Verified

- **IFC-019**: DONE ✅ (prerequisite completed)

## Artifacts to Produce

1. **docs/ai-architecture.md** - Comprehensive architecture documentation including:
   - System overview and design principles
   - Component architecture (chains, agents, memory, tools)
   - Zep memory integration design
   - Data flow diagrams
   - API contracts and interfaces
   - Cost management strategy
   - Monitoring and observability

2. **docs/architecture/diagrams/langchain-flow-diagram.mermaid** - Visual representation of:
   - LangChain pipeline flow
   - Memory layer (Zep) integration
   - Tool orchestration
   - Human-in-the-loop checkpoints

3. **artifacts/attestations/IFC-020/context_ack.json** - Evidence of context acknowledgment

## Next Steps

1. Design Zep memory integration layer
2. Define standard tool interfaces and contracts
3. Create architecture documentation
4. Generate flow diagram
5. Validate against quality gates
