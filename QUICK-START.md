# IntelliFlow CRM - Quick Start

## First Time Setup (5 minutes)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment file
cp .env.development .env

# 3. Start Docker services
pnpm run docker:up

# 4. Wait ~30 seconds for services to start, then setup database
pnpm run db:generate
pnpm run db:migrate
pnpm run db:seed

# 5. Start development
pnpm run dev
```

**Access Points:**

- Frontend: http://localhost:3000
- API: http://localhost:3001
- Database GUI: `pnpm run db:studio` → http://localhost:5555

---

## Daily Development

```bash
# Start services
pnpm run docker:up

# Start dev servers
pnpm run dev
```

---

## Common Commands

```bash
# Development
pnpm run dev              # All apps
pnpm run dev:web          # Frontend only
pnpm run dev:api          # API only

# Database
pnpm run db:studio        # Open database GUI
pnpm run db:seed          # Reset sample data
pnpm run db:reset         # Full database reset

# Testing
pnpm run test             # All tests
pnpm run test:watch       # Watch mode
pnpm run test:e2e         # E2E tests

# Code Quality
pnpm run lint:fix         # Fix linting issues
pnpm run format           # Format code
pnpm run typecheck        # Type check
pnpm run ci               # Run all checks

# Docker
pnpm run docker:up        # Start services
pnpm run docker:down      # Stop services
pnpm run docker:logs      # View logs
```

---

## Seeded Users

Email pattern: `{role}@intelliflow.dev`

- `admin@intelliflow.dev` - Admin user
- `manager@intelliflow.dev` - Manager
- `john.sales@intelliflow.dev` - Sales rep 1
- `jane.sales@intelliflow.dev` - Sales rep 2

---

## Troubleshooting

### "Port already in use"

```bash
# Kill process on port (example: 3000)
npx kill-port 3000
```

### "Database connection failed"

```bash
# Restart Docker services
pnpm run docker:down
pnpm run docker:up

# Wait 30 seconds, then retry
pnpm run db:migrate
```

### "Prisma client not found"

```bash
pnpm run db:generate
```

### "Module not found"

```bash
# Reinstall dependencies
pnpm install
```

---

## Project Structure

```
intelliFlow-CRM/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # tRPC API server
│   └── ai-worker/        # AI processing worker
├── packages/
│   ├── db/               # Prisma schema & client
│   ├── domain/           # Domain models
│   └── validators/       # Zod schemas
└── infra/
    └── docker/           # Docker configs
```

---

## Need Help?

1. Read [SETUP.md](./SETUP.md) - Comprehensive setup guide
2. Check [CLAUDE.md](./CLAUDE.md) - Architecture & patterns
3. View [ENV-013-016-SUMMARY.md](./ENV-013-016-SUMMARY.md) - Implementation
   details

---

## Next Steps

After setup, explore:

- Prisma Studio to see seeded data
- `apps/web` for frontend code
- `packages/domain` for business logic
- `packages/db/prisma/schema.prisma` for database schema
