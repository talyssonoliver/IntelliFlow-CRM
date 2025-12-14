# AI Worker

AI processing service for IntelliFlow CRM, powered by LangChain and OpenAI.

## Overview

The AI Worker handles all AI-powered features in IntelliFlow CRM:

- **Lead Scoring**: Automated lead quality scoring using LLM analysis
- **Lead Qualification**: Intelligent lead qualification with BANT framework
- **Agent Framework**: Extensible multi-agent system for complex workflows
- **Cost Tracking**: Built-in cost monitoring and limits
- **Structured Outputs**: Type-safe AI responses using Zod schemas

## Features

### 1. Lead Scoring Chain

LangChain-based pipeline that scores leads from 0-100 based on:
- Contact information completeness
- Engagement indicators
- Qualification signals
- Data quality

```typescript
import { leadScoringChain } from '@intelliflow/ai-worker';

const result = await leadScoringChain.scoreLead({
  email: 'john@acme.com',
  firstName: 'John',
  company: 'Acme Corp',
  title: 'VP Sales',
  source: 'WEBSITE'
});

console.log(result.score); // 85
console.log(result.confidence); // 0.92
console.log(result.factors); // Detailed scoring factors
```

### 2. Lead Qualification Agent

Specialized agent for lead qualification with detailed analysis:

```typescript
import { qualificationAgent, createQualificationTask } from '@intelliflow/ai-worker';

const task = createQualificationTask({
  leadId: 'lead-123',
  email: 'john@acme.com',
  company: 'Acme Corp',
  title: 'VP Sales',
  source: 'WEBSITE'
});

const result = await qualificationAgent.execute(task);

console.log(result.output.qualified); // true
console.log(result.output.qualificationLevel); // 'HIGH'
console.log(result.output.recommendedActions); // Next steps
```

### 3. Base Agent Framework

Extensible framework for building custom agents:

```typescript
import { BaseAgent, AgentTask } from '@intelliflow/ai-worker';

class CustomAgent extends BaseAgent<InputType, OutputType> {
  protected async executeTask(task: AgentTask<InputType, OutputType>): Promise<OutputType> {
    // Your agent logic here
  }
}
```

### 4. Cost Tracking

Automatic tracking of AI costs with limits:

```typescript
import { costTracker } from '@intelliflow/ai-worker';

// Get current daily cost
const dailyCost = costTracker.getDailyCost();

// Get detailed statistics
const stats = costTracker.getStatistics();

// Generate report
const report = costTracker.generateReport();
console.log(report);
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# AI Provider (openai or ollama)
AI_PROVIDER=openai

# OpenAI Configuration
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=2000

# Ollama Configuration (for local development)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral

# Cost Tracking
COST_TRACKING_ENABLED=true
COST_WARNING_THRESHOLD=10.0
COST_DAILY_LIMIT=50.0

# Performance
AI_CACHE_ENABLED=true
AI_CACHE_TTL=3600
AI_RATE_LIMIT=60

# Features
ENABLE_CHAIN_LOGGING=true
ENABLE_CONFIDENCE_SCORES=true
ENABLE_STRUCTURED_OUTPUTS=true
ENABLE_MULTI_AGENT=false

# Logging
LOG_LEVEL=info
```

### Using OpenAI (Production)

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-turbo-preview
```

### Using Ollama (Local Development)

1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull mistral`
3. Start Ollama: `ollama serve`
4. Configure:

```bash
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral
```

## Development

### Running the Worker

```bash
# Development mode with hot reload
pnpm dev

# Production mode
pnpm build
pnpm start
```

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Test specific chains
pnpm test:chains

# Benchmark AI performance
pnpm ai:benchmark
```

### Type Checking

```bash
pnpm typecheck
```

## Architecture

### Directory Structure

```
apps/ai-worker/
├── src/
│   ├── agents/           # AI agents
│   │   ├── base.agent.ts           # Base agent class
│   │   ├── qualification.agent.ts  # Lead qualification agent
│   │   └── crew.ts                 # Multi-agent crew framework
│   ├── chains/           # LangChain pipelines
│   │   └── scoring.chain.ts        # Lead scoring chain
│   ├── config/           # Configuration
│   │   └── ai.config.ts            # AI config and model pricing
│   ├── utils/            # Utilities
│   │   └── cost-tracker.ts         # Cost tracking service
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   └── index.ts          # Entry point
├── package.json
├── tsconfig.json
└── README.md
```

### Key Concepts

#### 1. Structured Outputs

All AI responses use Zod schemas for type safety:

```typescript
const outputSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  reasoning: z.string()
});

type Output = z.infer<typeof outputSchema>;
```

#### 2. Confidence Scores

Every AI operation includes a confidence score (0-1):

- 0.9+: Very high confidence, can auto-process
- 0.7-0.9: High confidence, minimal review needed
- 0.5-0.7: Medium confidence, review recommended
- <0.5: Low confidence, human review required

#### 3. Cost Tracking

Automatic tracking of:
- Token usage per operation
- Cost per model
- Daily spending
- Cost by operation type

#### 4. Human-in-the-Loop

Support for human oversight:
- Confidence thresholds trigger manual review
- All decisions are auditable
- Feedback improves future predictions

## Multi-Agent Workflows (Coming Soon)

CrewAI-style multi-agent collaboration for complex tasks:

```typescript
import { Crew, createLeadProcessingCrew } from '@intelliflow/ai-worker';

const crew = createLeadProcessingCrew([
  scoringAgent,
  qualificationAgent,
  enrichmentAgent,
  emailAgent
]);

const result = await crew.execute({
  id: 'task-123',
  description: 'Process new lead',
  expectedOutput: 'Qualified lead with personalized email'
});
```

## Performance

Target metrics:
- Lead scoring: <2s per lead
- Lead qualification: <3s per lead
- Batch processing: 30 leads/minute
- Cost per lead: <$0.01 (using GPT-4)

## Monitoring

The AI Worker automatically logs:
- Execution times
- Token usage
- Cost metrics
- Confidence scores
- Errors and retries

Use structured logging for observability:

```typescript
import pino from 'pino';

const logger = pino({
  name: 'ai-worker',
  level: 'info'
});
```

## Error Handling

The AI Worker includes robust error handling:

1. **Retry Logic**: Automatic retries with exponential backoff
2. **Fallbacks**: Default responses when AI fails
3. **Circuit Breaker**: Prevents cascading failures
4. **Rate Limiting**: Respects API limits
5. **Cost Limits**: Prevents runaway costs

## Best Practices

1. **Always validate inputs** using Zod schemas
2. **Set confidence thresholds** based on your risk tolerance
3. **Monitor costs** regularly and set appropriate limits
4. **Use Ollama for development** to avoid API costs
5. **Cache results** when appropriate
6. **Log everything** for debugging and auditing
7. **Test with real data** to tune confidence thresholds

## Troubleshooting

### High Costs

- Check `costTracker.generateReport()` to identify expensive operations
- Consider using cheaper models (GPT-3.5 instead of GPT-4)
- Enable caching to reduce redundant API calls
- Set `COST_DAILY_LIMIT` to prevent runaway costs

### Low Confidence Scores

- Provide more context in prompts
- Ensure input data is complete and accurate
- Fine-tune temperature settings
- Consider using more powerful models

### Slow Performance

- Enable caching
- Use batch processing for multiple leads
- Reduce `maxTokens` if responses are too long
- Consider parallel processing for independent tasks

## Contributing

When adding new agents or chains:

1. Extend `BaseAgent` for new agents
2. Use Zod schemas for all inputs/outputs
3. Include confidence scores in results
4. Add cost tracking
5. Write comprehensive tests
6. Document in this README

## License

Private - IntelliFlow CRM
