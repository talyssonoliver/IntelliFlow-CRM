# packages/db — Prisma Schema & Database Client

## Prisma Version

**Prisma 5.22.0** is used here (root has Prisma 7.3.0 — don't confuse them). Always run Prisma commands from `packages/db/` directory (has `.env` file).

## Critical Rules

### NEVER use `--no-engine` flag
It sets `copyEngine: false` in generated client, forcing Data Proxy engine which requires `prisma://` URLs. This breaks the web app's server-side Prisma usage with `postgresql://` URLs.

### DLL Lock on Windows
Many node processes run concurrently — DLL lock is common. Fix: stop dev server first, then `npx prisma generate` (without --no-engine).

### tenantId Rule
Almost all models need `tenantId` for multi-tenancy. Always check for it when adding new models.

### Schema vs Migration
**CRITICAL**: Always compare schema models against actual DB migration SQL before assuming schema is correct. Historical mismatches are documented in `memory/db-schema-history.md`.

## Commands

```bash
pnpm run db:generate          # Generate Prisma client (from packages/db/)
pnpm run db:migrate:create    # Create new migration
pnpm run db:migrate           # Apply migrations
pnpm run db:reset             # Reset database (destructive)
pnpm run db:studio            # Open Prisma Studio
```

## Type Generation Notes

- Prisma 5.22.0 only generates enum types when they're referenced by at least one model
- `--no-engine` generates full types (179K lines) only when schemas reference models; empty `.d.ts` means enums aren't used by any model
- Domain `CHURN_RISK_LEVELS` must match Prisma `ChurnRisk` enum

## Testing

- When Prisma mock types don't support `include`/`select` relations, cast mock data with `as any`
- Use `Record<string, any>` for mock repositories to avoid TS2348 "not callable" on vi.fn()

## Key Relations

- Lead: `aiScores AIScore[]` (scoring) AND `aiInsight LeadAIInsight?` (insights)
- Contact: `aiInsight ContactAIInsight?`
- Lead 360 fields: `location`, `website`, `avatarUrl`, `lastContactedAt`, `estimatedValue`, `tags`
- Lead relations: `activities` (LeadActivity), `notes` (LeadNote), `files` (LeadFile)
