# AI Worker Quick Start Guide

Get up and running with the IntelliFlow AI Worker in 5 minutes.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- OpenAI API key OR Ollama installed locally

## Step 1: Install Dependencies

From the monorepo root:

```bash
pnpm install
```

## Step 2: Configure Environment

Copy the example environment file:

```bash
cd apps/ai-worker
cp .env.example .env
```

### Option A: Using OpenAI (Recommended for Production)

Edit `.env` and add your OpenAI API key:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-turbo-preview
```

### Option B: Using Ollama (Recommended for Development)

1. Install Ollama from https://ollama.ai
2. Pull a model:
   ```bash
   ollama pull mistral
   ```
3. Start Ollama:
   ```bash
   ollama serve
   ```
4. Edit `.env`:
   ```bash
   AI_PROVIDER=ollama
   OLLAMA_MODEL=mistral
   ```

## Step 3: Run the Worker

```bash
# Development mode with hot reload
pnpm dev

# Or from monorepo root
pnpm --filter @intelliflow/ai-worker dev
```

You should see:

```
🤖 IntelliFlow AI Worker starting...
AI Worker configuration loaded
Cost tracker initialized
Lead scoring chain initialized
Qualification agent initialized
✅ AI Worker initialized successfully
AI Worker is ready and waiting for tasks...
```

## Step 4: Try the Examples

In a new terminal:

```bash
# Run usage examples
tsx src/examples/usage.ts

# Run benchmarks
pnpm ai:benchmark
```

## Step 5: Use in Your Code

```typescript
import { leadScoringChain, qualificationAgent } from '@intelliflow/ai-worker';

// Score a lead
const score = await leadScoringChain.scoreLead({
  email: 'john@acme.com',
  firstName: 'John',
  company: 'Acme Corp',
  title: 'VP Sales',
  source: 'WEBSITE',
});

console.log(`Score: ${score.score}/100`);
console.log(`Confidence: ${score.confidence}`);
```

## Step 6: Monitor Costs

```typescript
import { costTracker } from '@intelliflow/ai-worker';

// Get current daily cost
const cost = costTracker.getDailyCost();
console.log(`Today's cost: $${cost.toFixed(4)}`);

// Generate report
console.log(costTracker.generateReport());
```

## Common Tasks

### Run Tests

```bash
pnpm test
```

### Type Check

```bash
pnpm typecheck
```

### Build for Production

```bash
pnpm build
```

### Lint Code

```bash
pnpm lint
```

## Configuration Options

Key environment variables:

| Variable                 | Description           | Default               |
| ------------------------ | --------------------- | --------------------- |
| `AI_PROVIDER`            | `openai` or `ollama`  | `openai`              |
| `OPENAI_API_KEY`         | OpenAI API key        | -                     |
| `OPENAI_MODEL`           | Model name            | `gpt-4-turbo-preview` |
| `COST_WARNING_THRESHOLD` | Warning threshold ($) | `10.0`                |
| `COST_DAILY_LIMIT`       | Daily limit ($)       | -                     |
| `AI_CACHE_ENABLED`       | Enable caching        | `true`                |
| `LOG_LEVEL`              | Log level             | `info`                |

## Troubleshooting

### "OpenAI API key not found"

Make sure you've set `OPENAI_API_KEY` in `.env` or as an environment variable.

### "Connection refused" (Ollama)

Make sure Ollama is running:

```bash
ollama serve
```

### High costs

Set a daily limit:

```bash
COST_DAILY_LIMIT=25.0
```

### Slow performance

Try a faster model:

```bash
OPENAI_MODEL=gpt-3.5-turbo
```

Or enable caching:

```bash
AI_CACHE_ENABLED=true
```

## Next Steps

- Read the full [README.md](./README.md)
- Explore [usage examples](./src/examples/usage.ts)
- Run [benchmarks](./src/scripts/benchmark.ts)
- Check the [CLAUDE.md](../../CLAUDE.md) for architecture details

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review the full README.md
3. Check the CLAUDE.md for architecture guidance
4. Review the code examples in `src/examples/`

Happy AI coding! 🤖
