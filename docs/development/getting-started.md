# Getting Started

This guide will help you set up your local development environment for
IntelliFlow CRM, a modern AI-native platform built with **Hexagonal
Architecture**.

## Prerequisites

- **Node.js** (v20.0.0 or higher)
- **pnpm** (v9.0.0 or higher)
- **Docker Desktop** (for PostgreSQL, Redis, and Ollama)
- **Git**

## Installation

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/intelliflow-crm.git
cd intelliflow-crm
pnpm install
```

### 2. Infrastructure Setup

Start the required services using Docker:

```bash
# Start core DB and Cache
pnpm run docker:up

# Start AI inference (LiteLLM proxy — primary path)
docker compose -f infra/docker/docker-compose.litellm.yml up -d
# Verify: curl http://localhost:4000/v1/models
# See infra/litellm/README.md for configuration details.

# Alternative: Ollama for fully offline development
# docker compose -f docker-compose.ollama.yml up -d ollama
```

### 3. Database Initialization

```bash
pnpm run db:generate
pnpm run db:migrate
pnpm run db:seed
```

## Project Structure

Our architecture follows strict **Hexagonal** boundaries to isolate business
logic:

```
intelliFlow-CRM/
├── apps/
│   ├── web/              # Next.js 15+ Frontend
│   ├── api/              # tRPC API Gateway
│   ├── ai-worker/        # LLM Orchestration
│   └── workers/          # Background Jobs (Events, Notifications)
├── packages/
│   ├── domain/           # Pure Business Rules (DDD)
│   ├── application/      # Use Cases & Ports
│   ├── adapters/         # Infrastructure (Prisma, Redis, APIs)
│   └── db/               # Prisma Schema
```

## Development Workflow

### Starting Servers

We use Turborepo to manage multiple services:

```bash
# Start all core services (Web, API, Workers)
pnpm run dev

# Start only specific app
pnpm --filter web dev
```

### Testing & Validation

The project enforces strict architectural boundaries:

```bash
pnpm run test:architecture  # Verify Hexagonal boundaries
pnpm run test               # Run all unit/integration tests
pnpm run validate:sprint    # Run governance and state validation
```

## Current Project State

We are currently in **Sprint 17/18** (~65% complete). For a detailed status
report, see `docs/CURRENT_STATE_REPORT.md` or run the tracker:

```bash
pnpm tracker
```
