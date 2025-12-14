# IntelliFlow CRM - Setup Guide

This guide will help you set up the IntelliFlow CRM development environment.

## Prerequisites

- **Node.js**: >= 20.0.0
- **pnpm**: >= 8.0.0
- **Docker**: Latest version (for PostgreSQL, Redis, etc.)
- **Git**: Latest version

## Quick Start

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd intelliFlow-CRM

# Install all dependencies
pnpm install
```

### 2. Set Up Environment Variables

```bash
# Copy the development environment template
cp .env.development .env

# Edit .env and update any necessary values
# For local development, the defaults should work out of the box
```

### 3. Start Docker Services

```bash
# Start PostgreSQL, Redis, and other services
pnpm run docker:up

# Verify services are running
pnpm run docker:logs
```

### 4. Initialize Database

```bash
# Generate Prisma client
pnpm run db:generate

# Run migrations
pnpm run db:migrate

# Seed the database with sample data
pnpm run db:seed
```

### 5. Start Development Servers

```bash
# Start all applications (web, api, workers)
pnpm run dev

# Or start specific applications
pnpm run dev:web      # Next.js frontend only
pnpm run dev:api      # tRPC API server only
pnpm run dev:worker   # AI worker only
```

## Available Scripts

### Root Package Scripts

#### Development
- `pnpm run dev` - Start all applications in development mode
- `pnpm run dev:web` - Start Next.js frontend only
- `pnpm run dev:api` - Start tRPC API server only
- `pnpm run dev:worker` - Start AI worker only

#### Build
- `pnpm run build` - Build all packages
- `pnpm run build:web` - Build Next.js frontend only
- `pnpm run build:api` - Build API server only

#### Testing
- `pnpm run test` - Run all tests
- `pnpm run test:unit` - Run unit tests only
- `pnpm run test:integration` - Run integration tests
- `pnpm run test:e2e` - Run end-to-end tests
- `pnpm run test:watch` - Run tests in watch mode
- `pnpm run test:coverage` - Run tests with coverage report

#### Code Quality
- `pnpm run lint` - Lint all code
- `pnpm run lint:fix` - Lint and auto-fix issues
- `pnpm run format` - Format code with Prettier
- `pnpm run format:check` - Check code formatting
- `pnpm run typecheck` - Run TypeScript type checking

#### Database
- `pnpm run db:generate` - Generate Prisma client
- `pnpm run db:migrate` - Run database migrations
- `pnpm run db:migrate:create` - Create a new migration
- `pnpm run db:migrate:dev` - Run migrations in dev mode
- `pnpm run db:seed` - Seed database with sample data
- `pnpm run db:studio` - Open Prisma Studio GUI
- `pnpm run db:reset` - Reset database (WARNING: destroys all data)
- `pnpm run db:push` - Push schema changes without migration

#### Docker
- `pnpm run docker:up` - Start all Docker services
- `pnpm run docker:down` - Stop all Docker services
- `pnpm run docker:logs` - View Docker logs
- `pnpm run docker:reset` - Reset Docker services (removes volumes)

#### AI/LLM
- `pnpm run ai:benchmark` - Run AI performance benchmarks
- `pnpm run ai:test-chains` - Test AI chains

#### Utilities
- `pnpm run clean` - Clean build artifacts
- `pnpm run clean:deps` - Remove all node_modules
- `pnpm run clean:cache` - Clean Turbo cache
- `pnpm run setup:local` - Complete local setup (install + migrate + seed)
- `pnpm run ci` - Run CI checks (lint + typecheck + test)
- `pnpm run tracker` - Start project tracker

## Environment Configuration

### Environment Files

The project includes three environment configuration files:

1. **`.env.example`** - Complete reference of all environment variables
2. **`.env.development`** - Sensible defaults for local development
3. **`.env.test`** - Configuration for running tests

### Setting Up Your Environment

```bash
# For local development
cp .env.development .env

# For testing
# .env.test is automatically used when NODE_ENV=test
```

### Key Environment Variables

#### Database
- `DATABASE_URL` - PostgreSQL connection string
- `DIRECT_URL` - Direct database connection (for migrations)

#### AI/LLM
- `AI_PROVIDER` - Choose 'ollama' (local) or 'openai' (cloud)
- `OLLAMA_BASE_URL` - Ollama server URL (default: http://localhost:11434)
- `OPENAI_API_KEY` - OpenAI API key (only if using OpenAI)

#### Authentication
- `NEXTAUTH_SECRET` - Secret for NextAuth.js (generate with `openssl rand -base64 32`)
- `JWT_SECRET` - Secret for JWT tokens

#### Redis
- `REDIS_URL` - Redis connection string

## Database Setup

### Understanding Migrations

Migrations track changes to your database schema over time.

```bash
# Generate Prisma client (run after schema changes)
pnpm run db:generate

# Create a new migration
pnpm run db:migrate:create

# Apply migrations
pnpm run db:migrate

# Reset database and re-run all migrations
pnpm run db:reset
```

### Seeding the Database

The seed script creates sample data for development:

```bash
# Run the seed script
pnpm run db:seed
```

**What gets seeded:**
- 4 users (1 admin, 1 manager, 2 sales reps)
- 3 accounts
- 5 leads with various statuses
- 3 contacts
- 3 opportunities
- 5 AI scores for leads
- 5 tasks
- Sample audit logs and domain events

**Credentials for seeded users:**
- Admin: `admin@intelliflow.dev`
- Manager: `manager@intelliflow.dev`
- Sales Rep 1: `john.sales@intelliflow.dev`
- Sales Rep 2: `jane.sales@intelliflow.dev`

The seed script is **idempotent** - you can run it multiple times safely.

### Prisma Studio

Explore your database with a GUI:

```bash
pnpm run db:studio
```

This opens Prisma Studio at http://localhost:5555

## Docker Services

The project uses Docker Compose for local development services:

### Included Services

- **PostgreSQL** (port 5432) - Main database
- **PostgreSQL Test** (port 5433) - Test database
- **Redis** (port 6379) - Caching and rate limiting
- **Redis Test** (port 6380) - Test cache

### Docker Commands

```bash
# Start services
pnpm run docker:up

# Stop services
pnpm run docker:down

# View logs
pnpm run docker:logs

# Reset all data (WARNING: destroys volumes)
pnpm run docker:reset
```

## AI/LLM Setup

### Using Ollama (Recommended for Development)

Ollama runs LLMs locally, which is free and doesn't require API keys.

```bash
# Install Ollama
# Visit: https://ollama.ai/download

# Start Ollama server
ollama serve

# Pull required models
ollama pull llama2
ollama pull mistral
ollama pull nomic-embed-text

# In .env, set:
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
```

### Using OpenAI (For Production-like Testing)

```bash
# In .env, set:
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-turbo-preview
```

## Troubleshooting

### Port Already in Use

If you see port conflict errors:

```bash
# Check what's using the port
lsof -i :3000  # or whatever port

# Kill the process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Ensure Docker services are running
pnpm run docker:up

# Check service logs
pnpm run docker:logs

# Reset database if corrupted
pnpm run db:reset
```

### Prisma Client Out of Sync

```bash
# Regenerate Prisma client
pnpm run db:generate

# If issues persist, clean and reinstall
pnpm run clean
pnpm install
pnpm run db:generate
```

### Node Modules Issues

```bash
# Clean all node_modules and reinstall
pnpm run clean:deps
pnpm install
```

### Turbo Cache Issues

```bash
# Clear Turbo cache
pnpm run clean:cache
```

## Workspace Commands

The monorepo uses pnpm workspaces. You can run commands in specific packages:

```bash
# Run command in specific package
pnpm --filter @intelliflow/db <command>
pnpm --filter web <command>

# Examples
pnpm --filter @intelliflow/db db:generate
pnpm --filter web build
pnpm --filter domain test
```

## Development Workflow

### 1. Start Fresh Day

```bash
# Pull latest changes
git pull

# Install any new dependencies
pnpm install

# Start Docker services
pnpm run docker:up

# Start development servers
pnpm run dev
```

### 2. Making Changes

```bash
# Create a feature branch
git checkout -b feat/your-feature

# Make your changes...

# Run quality checks
pnpm run lint
pnpm run typecheck
pnpm run test

# Commit changes
git add .
git commit -m "feat: your feature description"
```

### 3. Database Schema Changes

```bash
# 1. Edit packages/db/prisma/schema.prisma

# 2. Create migration
pnpm run db:migrate:create

# 3. Name your migration when prompted

# 4. Generate Prisma client
pnpm run db:generate

# 5. Update seed script if needed

# 6. Test migration
pnpm run db:reset
pnpm run db:seed
```

### 4. Running Tests

```bash
# Unit tests (fast)
pnpm run test:unit

# Integration tests (with test DB)
pnpm run test:integration

# E2E tests (full browser tests)
pnpm run test:e2e

# Watch mode for TDD
pnpm run test:watch
```

## CI/CD Integration

The `pnpm run ci` command runs all checks that CI will run:

```bash
pnpm run ci
# Equivalent to:
# pnpm run lint && pnpm run typecheck && pnpm run test
```

## Performance Tips

### Turbo Caching

Turbo automatically caches build outputs and test results:

- First build: ~3 minutes
- Cached build: ~10 seconds

### Parallel Execution

Turbo runs tasks in parallel when possible:

```bash
# Runs all tests in parallel
pnpm run test

# Force sequential execution
pnpm run test --concurrency=1
```

### Remote Caching

To enable remote caching (for teams):

```bash
# Login to Turbo
npx turbo login

# Link repository
npx turbo link
```

## Next Steps

- Read [CLAUDE.md](./CLAUDE.md) for architecture and patterns
- Review [Sprint_plan.csv](./Sprint_plan.csv) for project roadmap
- Check [Readme.md](./Readme.md) for project overview
- Explore the codebase starting with `apps/web` and `packages/domain`

## Getting Help

- Check existing issues in the repository
- Review documentation in `docs/`
- Ask in team chat/Slack
- Consult CLAUDE.md for AI-assisted development patterns

## Common Tasks Quick Reference

```bash
# Fresh setup
pnpm install && pnpm run setup:local

# Daily development
pnpm run docker:up && pnpm run dev

# Before committing
pnpm run lint:fix && pnpm run typecheck && pnpm run test

# Database work
pnpm run db:studio  # GUI
pnpm run db:seed    # Sample data
pnpm run db:reset   # Fresh start

# Debugging
pnpm run docker:logs  # Service logs
pnpm run db:studio    # Inspect database
```
