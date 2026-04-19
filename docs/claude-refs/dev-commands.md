# Development Commands

## Environment Setup

```bash
pnpm install                    # Install dependencies
pnpm run setup:local            # Setup local environment
docker-compose up -d            # Start Docker services (Postgres, Redis, etc.)
pnpm run db:migrate             # Apply database migrations
pnpm run db:seed                # Seed database
```

## Development

```bash
pnpm run dev                    # Start all applications
pnpm --filter web dev           # Start frontend only
pnpm --filter api dev           # Start API only
pnpm --filter ai-worker dev     # Start AI worker only
pnpm run build                  # Build all packages
pnpm run typecheck              # Type checking across monorepo (turborepo)
```

## Testing

```bash
pnpm run test                   # Run all tests
pnpm run test:unit -- --coverage  # Unit tests with coverage
pnpm run test:integration       # Integration tests
pnpm run test:e2e               # E2E tests (Playwright)
pnpm run test:watch             # Watch mode for TDD
pnpm --filter @intelliflow/domain test  # Tests for specific package
```

## Database

```bash
pnpm run db:migrate:create      # Create new migration
pnpm run db:migrate             # Apply migrations
pnpm run db:reset               # Reset database (destructive)
pnpm run db:studio              # Open Prisma Studio
pnpm run db:generate            # Generate Prisma client
```

## Linting & Formatting

```bash
pnpm run lint                   # Lint all code
pnpm run lint:fix               # Fix linting issues
pnpm run format                 # Format with Prettier
pnpm run typecheck              # Type check (use this, NOT `npx tsc --noEmit`)
```

## Performance Auditing (Lighthouse CI)

```bash
pnpm run lighthouse             # Run against all configured URLs (needs dev server)
pnpm run lighthouse:ci          # Filesystem output for CI pipelines
npx lhci autorun --collect.url=http://localhost:3000/email --collect.numberOfRuns=1  # Single URL
```

Config: `lighthouserc.js` — 27 URLs, desktop preset, >=90% thresholds. Reports:
`artifacts/lighthouse/`

## AI Development

### AI inference (primary path)

```bash
docker compose -f infra/docker/docker-compose.litellm.yml up -d   # Start LiteLLM proxy
curl http://localhost:4000/v1/models                               # Smoke-test proxy
pnpm --filter ai-worker test:chains  # Test AI chains
pnpm run ai:benchmark           # Benchmark AI performance
```

### Offline fallback (Ollama)

```bash
ollama serve                              # Start Ollama
ollama pull mistral:7b-instruct-q4_K_M   # Pull required model
```

## Data Sync

```bash
curl -X POST http://localhost:3002/api/sync-metrics   # Sync metrics via API
cd apps/project-tracker && npx tsx scripts/sync-metrics.ts  # CLI sync
```
