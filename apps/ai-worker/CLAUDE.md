# apps/ai-worker — AI Processing Worker

## Stack

- **LangChain** for chain-based AI pipelines
- **CrewAI** for multi-agent collaboration
- **Ollama** for local development (no API costs)
- **OpenAI API** for production

## Key Patterns

### Scoring Pipeline
`src/chains/scoring.chain.ts` — LangChain structured outputs for lead scoring.
Target: < 2s per lead.

### Agent Framework
`src/agents/` — CrewAI agents for lead qualification, email generation, follow-ups.

### Human-in-the-Loop
All AI outputs include confidence scores and allow human override/feedback.

### Cost Optimization
- Ollama for development/testing (free, local)
- OpenAI for production
- Caching and rate limiting to control costs

## Development

```bash
ollama serve                          # Start Ollama
ollama pull llama2 && ollama pull mistral  # Pull required models
pnpm --filter ai-worker test:chains   # Test AI chains
pnpm run ai:benchmark                 # Benchmark performance
```

## Critical Rules

- All LLM outputs MUST conform to predefined Zod schemas
- Always set appropriate timeouts for LLM calls
- AI outputs must be sanitized before rendering in UI
- Target: AI scoring <2s, predictions <2s
