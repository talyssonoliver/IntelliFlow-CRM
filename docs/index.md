# IntelliFlow CRM Documentation

Welcome to the IntelliFlow CRM documentation. This AI-powered CRM system is
built with a modern tech stack optimized for AI-first development, emphasizing
automation, type safety, and AI-assisted workflows.

## What is IntelliFlow CRM?

IntelliFlow CRM is an intelligent customer relationship management system that
leverages artificial intelligence to automate lead scoring, qualification, and
engagement. Built with a modern monorepo architecture, it provides end-to-end
type safety and seamless integration between the frontend, backend, and AI
services.

## Key Features

- **AI-Powered Lead Scoring**: Automatically score and qualify leads using
  LangChain and CrewAI agents
- **Type-Safe API**: End-to-end type safety with tRPC from backend to frontend
- **Modern Stack**: Built with Next.js 16.0.10, Prisma, PostgreSQL, and Supabase
- **Vector Search**: pgvector integration for semantic search and embeddings
- **Real-time Analytics**: Track lead engagement and conversion metrics
- **Automated Workflows**: AI agents handle routine tasks and follow-ups
- **Developer Experience**: Optimized for AI-assisted development with Claude
  Code and GitHub Copilot

## Architecture Overview

IntelliFlow CRM follows a Domain-Driven Design (DDD) approach with hexagonal
architecture:

```
intelliFlow-CRM/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # tRPC API server
│   └── ai-worker/        # AI processing worker
├── packages/
│   ├── db/               # Prisma schema and database client
│   ├── domain/           # Domain models (DDD)
│   ├── validators/       # Zod validation schemas
│   ├── api-client/       # Generated tRPC client
│   └── ui/               # Shared UI components
├── infra/                # Infrastructure configurations
└── docs/                 # Documentation (you are here)
```

## Quick Links

- [Getting Started](./getting-started.md) - Set up your local development
  environment
- [Architecture](./architecture/overview.md) - Learn about the system
  architecture
- [API Reference](./api/overview.md) - Explore the tRPC API
- [AI Integration](./ai/overview.md) - Understand AI components and agents
- [Development Guide](./development/overview.md) - Best practices and patterns
- [Deployment](./deployment/overview.md) - Deploy to production

## Technology Stack

### Frontend

- **Next.js 16.0.10** with App Router
- **shadcn/ui** components
- **Tailwind CSS** for styling
- **React Query** for data fetching
- **tRPC Client** for type-safe API calls

### Backend

- **tRPC** for type-safe APIs
- **Prisma ORM** with PostgreSQL
- **Supabase** for authentication and database
- **Redis** for caching and rate limiting

### AI/LLM

- **LangChain** for AI chains and pipelines
- **CrewAI** for multi-agent collaboration
- **OpenAI API** for production
- **Ollama** for local development
- **pgvector** for embeddings storage

### Infrastructure

- **Docker Compose** for local development
- **Turborepo** for monorepo management
- **pnpm** for package management
- **Railway/Vercel** for deployment

## Core Principles

### Type Safety

End-to-end type safety is enforced across the entire stack, from database to
frontend:

- Prisma generates TypeScript types from schema
- Zod schemas validate runtime data
- tRPC provides compile-time type safety for API calls

### Domain-Driven Design

The codebase follows DDD principles with clear bounded contexts:

- Domain logic is isolated from infrastructure
- Repository pattern for data access
- Domain events for inter-context communication

### AI-First Development

The project is optimized for AI-assisted development:

- Claude Code integration for development workflows
- GitHub Copilot support with custom instructions
- Automated testing and validation

## Getting Help

- **Issues**: Report bugs and request features on
  [GitHub Issues](https://github.com/yourusername/intelliflow-crm/issues)
- **Discussions**: Join the conversation on
  [GitHub Discussions](https://github.com/yourusername/intelliflow-crm/discussions)
- **Documentation**: Browse the full documentation at [docs/](.)

## Contributing

We welcome contributions! Please read our
[Contributing Guide](./contributing.md) to get started.

## License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE)
file for details.

---

Ready to get started? Head over to the
[Getting Started Guide](./getting-started.md) to set up your development
environment.
