# Getting Started with IntelliFlow CRM

Welcome to IntelliFlow CRM! This guide will walk you through setting up your
local development environment and getting the application running.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software

- **Node.js** v20.0.0 or higher
  - Download from [nodejs.org](https://nodejs.org/)
  - Verify installation: `node --version`

- **pnpm** v8.0.0 or higher
  - Install: `npm install -g pnpm`
  - Verify installation: `pnpm --version`

- **Docker Desktop**
  - Download from [docker.com](https://www.docker.com/products/docker-desktop)
  - Required for running PostgreSQL, Redis, and other services
  - Verify installation: `docker --version`

- **Git**
  - Download from [git-scm.com](https://git-scm.com/)
  - Verify installation: `git --version`

### Optional but Recommended

- **Visual Studio Code** with recommended extensions:
  - ESLint
  - Prettier
  - Prisma
  - Tailwind CSS IntelliSense
  - GitLens

- **Ollama** for local AI development:
  - Download from [ollama.ai](https://ollama.ai/)
  - Allows running LLMs locally without API costs

## Step 1: Clone the Repository

Clone the IntelliFlow CRM repository to your local machine:

```bash
git clone https://github.com/intelliflow/intelliflow-crm.git
cd intelliflow-crm
```

## Step 2: Install Dependencies

Install all workspace dependencies using pnpm:

```bash
pnpm install
```

This will install dependencies for all applications and packages in the
monorepo. The process may take a few minutes on first run.

## Step 3: Environment Setup

### Copy Environment Template

Create your local environment files from the examples:

```bash
# Copy development environment
cp .env.example .env.development

# Copy test environment
cp .env.example .env.test
```

### Configure Environment Variables

Edit `.env.development` with your local configuration:

```env
# Database Configuration
DATABASE_URL="postgresql://intelliflow:dev_password@localhost:5432/intelliflow_dev"
DIRECT_URL="postgresql://intelliflow:dev_password@localhost:5432/intelliflow_dev"

# Redis Configuration
REDIS_URL="redis://localhost:6379"

# API Configuration
API_URL="http://localhost:4000"
NEXT_PUBLIC_API_URL="http://localhost:4000"

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key-here"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# AI Services (Optional for development)
OPENAI_API_KEY=""  # Leave empty to use Ollama
OLLAMA_BASE_URL="http://localhost:11434"

# Application Settings
NODE_ENV="development"
LOG_LEVEL="debug"
```

**Important Notes:**

- For local development, you can leave `OPENAI_API_KEY` empty and use Ollama
- Supabase keys will be generated when you start the local Supabase instance
- Never commit `.env.development` or `.env.test` to version control

## Step 4: Start Infrastructure Services

Start the required Docker services (PostgreSQL, Redis, Ollama):

```bash
# Start all infrastructure services
docker-compose up -d

# Verify services are running
docker-compose ps
```

You should see:

- `postgres` - Running on port 5432
- `redis` - Running on port 6379
- `ollama` - Running on port 11434 (optional)

### Verify Services

```bash
# Check PostgreSQL
docker-compose exec postgres psql -U intelliflow -d intelliflow_dev -c "SELECT version();"

# Check Redis
docker-compose exec redis redis-cli ping
# Should output: PONG
```

## Step 5: Initialize Database

### Generate Prisma Client

Generate the Prisma client from the schema:

```bash
pnpm run db:generate
```

### Run Database Migrations

Apply all database migrations:

```bash
pnpm run db:migrate
```

This will:

1. Create all database tables
2. Set up indexes and constraints
3. Configure Row Level Security (RLS) policies
4. Install pgvector extension

### Seed Database (Optional)

Populate the database with sample data for development:

```bash
pnpm run db:seed
```

This will create:

- Sample users
- Example leads and contacts
- Test accounts and opportunities
- Demo AI scoring data

## Step 6: Set Up Ollama (Optional)

If you want to use local AI models instead of OpenAI:

### Install Ollama

```bash
# macOS/Linux
curl https://ollama.ai/install.sh | sh

# Windows
# Download installer from https://ollama.ai/download
```

### Pull Required Models

```bash
# Pull Llama 2 (7B parameters)
ollama pull llama2

# Pull Mistral (7B parameters)
ollama pull mistral

# Verify models
ollama list
```

### Test Ollama

```bash
# Run a test prompt
ollama run llama2 "Hello, world!"
```

## Step 7: Start Development Servers

### Start All Applications

Start all applications in development mode:

```bash
pnpm run dev
```

This will start:

- **Web app**: http://localhost:3000
- **API server**: http://localhost:4000
- **AI worker**: http://localhost:5000
- **Project tracker**: http://localhost:3002

### Start Individual Applications

Alternatively, start specific applications:

```bash
# Web application only
pnpm --filter web dev

# API server only
pnpm --filter api dev

# AI worker only
pnpm --filter ai-worker dev

# Project tracker
pnpm run tracker
```

## Step 8: Verify Installation

### Check Web Application

Open your browser and navigate to http://localhost:3000

You should see the IntelliFlow CRM landing page.

### Check API Health

Test the API health endpoint:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-12-15T10:00:00.000Z",
  "uptime": 123.456,
  "database": "connected",
  "redis": "connected"
}
```

### Check Project Tracker

Navigate to http://localhost:3002 to view the Sprint tracking dashboard.

## Step 9: Run Tests

Verify everything is working by running the test suite:

```bash
# Run all tests
pnpm run test

# Run tests with coverage
pnpm run test -- --coverage

# Run tests in watch mode (for development)
pnpm run test:watch
```

## Development Workflow

### Working with the Codebase

```bash
# Type checking across all packages
pnpm run typecheck

# Lint all code
pnpm run lint

# Fix linting issues automatically
pnpm run lint:fix

# Format code with Prettier
pnpm run format
```

### Database Operations

```bash
# Open Prisma Studio (database GUI)
pnpm run db:studio

# Create a new migration
pnpm run db:migrate:create

# Reset database (WARNING: destroys data)
pnpm run db:reset

# View migration status
pnpm run db:migrate:status
```

### Building for Production

```bash
# Build all applications
pnpm run build

# Build specific application
pnpm --filter web build
pnpm --filter api build
```

## Common Tasks

### Adding a New Lead

Once the application is running:

1. Navigate to http://localhost:3000
2. Click "Leads" in the navigation
3. Click "New Lead"
4. Fill in the form:
   - First Name: John
   - Last Name: Doe
   - Email: john.doe@example.com
   - Company: Acme Corp
5. Click "Save"

### Testing AI Scoring

To test the AI lead scoring feature:

```bash
# Using the API directly
curl -X POST http://localhost:4000/api/trpc/leads.score \
  -H "Content-Type: application/json" \
  -d '{
    "leadId": "lead_123",
    "forceRescore": true
  }'
```

Or use the web UI:

1. Go to a lead detail page
2. Click "Score Lead" button
3. View the AI-generated score and explanation

### Viewing Logs

```bash
# View API logs
pnpm --filter api dev | bunyan

# View AI worker logs
pnpm --filter ai-worker dev

# View Docker service logs
docker-compose logs -f postgres
docker-compose logs -f redis
```

## Troubleshooting

### Port Already in Use

If you get port conflicts:

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use different ports in .env.development
NEXT_PUBLIC_PORT=3001
API_PORT=4001
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres

# Reset database connection
pnpm run db:reset
```

### Prisma Client Errors

```bash
# Regenerate Prisma client
pnpm run db:generate

# Clear Prisma client cache
rm -rf node_modules/.prisma
pnpm run db:generate

# If schema changed, create migration
pnpm run db:migrate:create
```

### Module Not Found Errors

```bash
# Clear all node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install

# Clear Turborepo cache
rm -rf .turbo
pnpm run build
```

### AI Worker Issues

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Pull models again
ollama pull llama2

# Test Ollama directly
ollama run llama2 "Test prompt"

# Check AI worker logs
pnpm --filter ai-worker dev
```

### Type Errors After Updates

```bash
# Regenerate all generated code
pnpm run db:generate

# Rebuild all packages
pnpm run build

# Run type checking
pnpm run typecheck
```

## Next Steps

Now that you have IntelliFlow CRM running locally, here are some next steps:

1. **[Explore the Architecture](../architecture/overview.md)**: Learn about the
   system design
2. **[Understand Domain Models](../architecture/domain/overview.md)**: Study the
   domain-driven design
3. **[Review API Routes](../api/trpc-routes.md)**: Browse the available API
   endpoints
4. **[Read Development Guide](./development.md)**: Learn development best
   practices
5. **[Work with AI](./ai-development.md)**: Build AI-powered features

## Getting Help

If you encounter issues not covered here:

- **Documentation**: Browse the full [documentation](../index.md)
- **GitHub Issues**:
  [Search existing issues](https://github.com/intelliflow/intelliflow-crm/issues)
- **GitHub Discussions**:
  [Ask the community](https://github.com/intelliflow/intelliflow-crm/discussions)
- **CLAUDE.md**: Review the [AI assistant instructions](../../CLAUDE.md) for
  development context

## Development Tools

### Recommended VS Code Extensions

Install these extensions for the best development experience:

```bash
# Install recommended extensions
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension Prisma.prisma
code --install-extension bradlc.vscode-tailwindcss
code --install-extension eamodio.gitlens
```

### Browser Extensions

- **React Developer Tools**: Debug React components
- **tRPC Panel**: Interactive API explorer (http://localhost:4000/panel)
- **Redux DevTools**: Inspect state management (if using Redux)

## Contributing

Ready to contribute? Check out our [Contributing Guide](./contributing.md) to
learn about:

- Code style and conventions
- Git workflow
- Pull request process
- Testing requirements

---

**Welcome to IntelliFlow CRM development!** If you have any questions, don't
hesitate to ask in GitHub Discussions.
