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

`src/agents/` — CrewAI agents for lead qualification, email generation,
follow-ups.

### Folded Workers (#230)

`src/workers/notification-email-worker.ts` consumes
`intelliflow-notifications-email` (ticket-assignment emails), folded in from the
removed `apps/workers/notifications-worker`. Booted from
`AIWorker.initPrismaDependentServices()`. `events-worker` (outbox dispatch and
scheduled maintenance jobs) is NOT folded: it keeps running as its own service.

### Human-in-the-Loop

All AI outputs include confidence scores and allow human override/feedback.

### Production Chat on OpenRouter

Production runs `AI_PROVIDER=openrouter` (`src/lib/llm-factory.ts`). The default
model is `nvidia/nemotron-3-ultra-550b-a55b:free`, with
`nvidia/nemotron-3.5-lightning:free` as OpenRouter's own fallback
(`OPENROUTER_FALLBACK_MODELS`, sent as the request's `models` list).
`OPENROUTER_MODEL` / `OPENROUTER_MODEL_<TIER>` still win over the default.

- **Structured output uses tool calling on OpenRouter**, set once in the factory
  (`withFunctionCallingDefault`). `@langchain/openai` defaults to strict
  `json_schema`, which the free models reject with 404 "No endpoints found that
  can handle the requested parameters". Don't pass `method: 'jsonSchema'` at a
  call site.
- **Free models get withdrawn.** `openai/gpt-oss-120b:free` disappeared in
  October 2026 and every call returned 404. The fallback list accepts only
  `:free` ids (a paid one is dropped with a warning): OpenRouter bills a
  fallback at its own price, while metering prices the call as the primary. For
  the same reason the list is sent only when the primary is itself `:free`.

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
