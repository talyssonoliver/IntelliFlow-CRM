# packages/db — Prisma Schema & Database Client

## Prisma Version

**Prisma 7.4.2** with `engineType = "client"` (client engine, no binary engine).
Connection uses `@prisma/adapter-pg` — all `PrismaClient()` constructors MUST
pass an `adapter` parameter.

Generated client lives at `packages/db/generated/prisma/` (git-ignored,
regenerated on `pnpm install` via postinstall). All packages import Prisma types
from `@intelliflow/db`, NOT from `@prisma/client` directly.

Config: `prisma.config.ts` at package root (Prisma 7 CLI config for connection
URLs).

## Critical Rules

### PrismaClient requires adapter

Every `new PrismaClient()` MUST include
`{ adapter: new PrismaPg({ connectionString: ... }) }`. Constructing without
adapter will throw at runtime.

### Import from @intelliflow/db, NOT @prisma/client

All external packages MUST use `import { ... } from '@intelliflow/db'`. The only
files that import from `../generated/prisma/client` are inside
`packages/db/src/`.

### tenantId Rule

Almost all models need `tenantId` for multi-tenancy. Always check for it when
adding new models.

### Schema vs Migration

**CRITICAL**: Always compare schema models against actual DB migration SQL
before assuming schema is correct. Historical mismatches are documented in
`memory/db-schema-history.md`.

## Commands

```bash
pnpm run db:generate          # Generate Prisma client (from packages/db/)
pnpm run db:migrate:create    # Create new migration
pnpm run db:migrate           # Apply migrations
pnpm run db:reset             # Reset database (destructive)
pnpm run db:studio            # Open Prisma Studio
```

## Build Architecture

- Generated client at `packages/db/generated/prisma/` (outside `src/`)
- Both `src/` and `dist/` resolve `../generated/prisma/client` to the same
  location
- `tsup.config.ts` externalizes `generated/prisma` via regex to prevent bundling
- `tsconfig.json` rootDir is `.` (not `./src`) to include generated types in DTS
  output

## Testing

- When Prisma mock types don't support `include`/`select` relations, cast mock
  data with `as any`
- Use `Record<string, any>` for mock repositories to avoid TS2348 "not callable"
  on vi.fn()
- Test files creating `PrismaClient` must provide `PrismaPg` adapter

## Key Relations

- Lead: `aiScores AIScore[]` (scoring) AND `aiInsight LeadAIInsight?` (insights)
- Contact: `aiInsight ContactAIInsight?`
- Lead 360 fields: `location`, `website`, `avatarUrl`, `lastContactedAt`,
  `estimatedValue`, `tags`
- Lead relations: `activities` (LeadActivity), `notes` (LeadNote), `files`
  (LeadFile)
