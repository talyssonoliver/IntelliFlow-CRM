# Getting Started

This guide will help you set up your local development environment for
IntelliFlow CRM.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js** (v20.0.0 or higher)
- **pnpm** (v8.0.0 or higher)
- **Docker Desktop** (for running PostgreSQL, Redis, etc.)
- **Git** (for version control)

Optional but recommended:

- **VS Code** with recommended extensions
- **Ollama** (for local AI development)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/intelliflow-crm.git
cd intelliflow-crm
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
pnpm install
```

This will install dependencies for all packages and applications in the
monorepo.

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit the `.env` file and configure the following variables:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/intelliflow_dev?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# API Configuration
API_URL="http://localhost:4000"
NEXT_PUBLIC_API_URL="http://localhost:4000"

# AI Services
OPENAI_API_KEY="sk-your-key-here"  # Optional for development
OLLAMA_BASE_URL="http://localhost:11434"

# Authentication (Supabase)
NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### 4. Start Docker Services

Start the base infrastructure services (PostgreSQL, Redis):

```bash
docker compose up -d postgres redis
```

For the recommended base + overlays workflow (especially on low-RAM machines),
see `docs/setup/docker-compose-overlays.md`.

Optional: start test containers (used by integration tests):

```bash
docker compose up -d postgres-test redis-test
```

Optional: start Ollama (local AI dev, persisted via named volume):

```bash
docker compose -f docker-compose.yml -f docker-compose.ollama.yml up -d ollama
```

Optional: start admin tools (Adminer, RedisInsight, Mailhog):

```bash
docker compose --profile tools up -d adminer redis-insight mailhog
```

Verify services are running:

```bash
docker compose ps
```

### 5. Initialize Database

Run database migrations and seed data:

```bash
# Generate Prisma client
pnpm run db:generate

# Run migrations
pnpm run db:migrate

# Seed database (optional)
pnpm run db:seed
```

### 6. Start Development Servers

You can start all applications at once or individually:

#### Start All Applications

```bash
pnpm run dev
```

This will start:

- Web app on http://localhost:3000
- API server on http://localhost:4000
- AI worker on http://localhost:5000
- Project tracker on http://localhost:3002

#### Start Individual Applications

```bash
# Start web application only
pnpm --filter web dev

# Start API server only
pnpm --filter api dev

# Start AI worker only
pnpm --filter ai-worker dev

# Start project tracker
pnpm run tracker
```

### 7. Verify Installation

Open your browser and navigate to:

- **Web App**: http://localhost:3000
- **API Health Check**: http://localhost:4000/health
- **Project Tracker**: http://localhost:3002

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test -- --coverage

# Run tests for specific package
pnpm --filter @intelliflow/domain test
```

### Linting and Formatting

```bash
# Lint all code
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Format code
pnpm run format

# Type checking
pnpm run typecheck
```

### Database Management

```bash
# Open Prisma Studio (database GUI)
pnpm run db:studio

# Create new migration
pnpm run db:migrate:create

# Reset database (destructive!)
pnpm run db:reset
```

### Working with AI Models (Ollama)

If you're using Ollama for local AI development:

```bash
# Pull required models
ollama pull llama2
ollama pull mistral

# List available models
ollama list

# Test a model
ollama run llama2 "Hello, world!"
```

## Project Structure

Here's an overview of the key directories:

```
intelliFlow-CRM/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # tRPC API server
│   ├── ai-worker/        # AI processing worker
│   └── project-tracker/  # Sprint tracking tool
├── packages/
│   ├── db/               # Prisma schema
│   ├── domain/           # Domain models
│   ├── validators/       # Zod schemas
│   ├── api-client/       # tRPC client
│   ├── ui/               # Shared UI components
│   └── typescript-config/ # Shared TypeScript config
├── infra/
│   ├── docker/           # Dockerfiles
│   ├── supabase/         # Supabase config
│   └── monitoring/       # Observability config
├── docs/                 # Documentation
├── tests/                # Shared test utilities
└── tools/                # Development tools
```

## Common Tasks

### Adding a New Package

```bash
# Create new package directory
mkdir packages/my-package

# Initialize package.json
cd packages/my-package
pnpm init
```

### Creating a New Feature

1. Create domain model in `packages/domain/`
2. Update Prisma schema in `packages/db/`
3. Generate migration: `pnpm run db:migrate:create`
4. Create tRPC router in `apps/api/`
5. Build UI in `apps/web/`
6. Write tests

### Git Workflow

We use conventional commits:

```bash
# Stage changes
git add .

# Commit with conventional commit format
git commit -m "feat: add lead scoring API"
git commit -m "fix(api): resolve CORS issue"
git commit -m "docs: update getting started guide"
```

The pre-commit hook will automatically:

- Run linting
- Run type checking
- Format code
- Run affected tests

## Troubleshooting

### Port Already in Use

If you get port conflicts, check what's running:

```bash
# Check port 3000
lsof -i :3000

# Kill process on port 3000
kill -9 $(lsof -t -i:3000)
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker compose ps postgres

# View PostgreSQL logs
docker compose logs postgres

# Restart PostgreSQL
docker compose restart postgres
```

### Prisma Client Errors

```bash
# Regenerate Prisma client
pnpm run db:generate

# If schema changed, create migration
pnpm run db:migrate
```

### Module Not Found Errors

```bash
# Clear all node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### Type Errors After Updates

```bash
# Regenerate all generated code
pnpm run db:generate

# Run type checking to see all errors
pnpm run typecheck
```

## Next Steps

Now that you have your development environment set up:

1. **Explore the Architecture**: Read the
   [Architecture Overview](./architecture/overview.md)
2. **Understand Domain Models**: Check out
   [Domain-Driven Design](./architecture/ddd.md)
3. **Learn the API**: Browse the [API Reference](./api/overview.md)
4. **Build Features**: Follow the [Development Guide](./development/overview.md)
5. **Work with AI**: Explore [AI Integration](./ai/overview.md)

## Getting Help

If you encounter issues:

- Check the [Troubleshooting](#troubleshooting) section above
- Search [GitHub Issues](https://github.com/yourusername/intelliflow-crm/issues)
- Ask in
  [GitHub Discussions](https://github.com/yourusername/intelliflow-crm/discussions)
- Review the [CLAUDE.md](../CLAUDE.md) file for AI-assisted development tips

Happy coding!
