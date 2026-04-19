# ADR-004: Multi-tenancy Architecture

**Status:** Accepted

**Date:** 2025-12-20

**Deciders:** Tech Lead, Architect, Backend Team

**Technical Story:** IFC-135, IFC-002

## Context and Problem Statement

IntelliFlow CRM needs to support multiple law firms (tenants) on a shared
infrastructure while ensuring complete data isolation, security, and per-tenant
customization. How should we implement multi-tenancy to maximize security,
minimize cost, and allow tenant-specific configurations while maintaining a
single codebase?

## Decision Drivers

- **Data Isolation**: Absolute guarantee that one tenant cannot access another's
  data
- **Security**: Compliance with legal industry standards (GDPR, data residency)
- **Cost Efficiency**: Shared infrastructure to minimize per-tenant costs
- **Performance**: Query performance must not degrade with tenant growth
- **Customization**: Support tenant-specific workflows, branding, and
  configurations
- **Maintenance**: Single codebase deployment for all tenants
- **Scalability**: Support 100+ tenants on shared infrastructure

## Considered Options

- **Option 1**: Database-per-tenant (separate PostgreSQL database per tenant)
- **Option 2**: Schema-per-tenant (separate PostgreSQL schema per tenant)
- **Option 3**: Row-level isolation with Supabase RLS (tenant_id column + Row
  Level Security)
- **Option 4**: Hybrid approach (shared tables + tenant-specific tables)

## Decision Outcome

Chosen option: "Row-level isolation with Supabase RLS", because it provides the
best balance of security, cost efficiency, and simplicity. Supabase's built-in
Row Level Security (RLS) policies enforce data isolation at the database level,
preventing tenant data leakage even if application code has bugs. This approach
works seamlessly with Prisma and requires minimal infrastructure overhead.

### Positive Consequences

- **Database-enforced isolation**: RLS policies prevent cross-tenant queries at
  the database level
- **Cost efficient**: Single database instance for all tenants
- **Simple deployment**: No complex tenant provisioning or routing logic
- **Query performance**: PostgreSQL indexes work efficiently with tenant_id
- **Audit trail**: All queries automatically scoped to tenant via RLS
- **Prisma integration**: Middleware automatically injects tenant_id
- **Horizontal scaling**: Can shard by tenant_id if needed in future
- **Backup simplicity**: Single database to backup with per-tenant restore
  capability

### Negative Consequences

- **Performance overhead**: Every query includes tenant_id filter (mitigated by
  indexes)
- **Resource contention**: Large tenants can impact small tenants (mitigated by
  connection pooling)
- **Schema changes**: Must coordinate schema migrations across all tenants
- **Noisy neighbor**: One tenant's heavy load affects others (monitoring
  required)
- **Limited isolation**: All tenants share same database resources

## Pros and Cons of the Options

### Database-per-tenant

Separate PostgreSQL database for each tenant.

- Good, because it provides maximum isolation and security
- Good, because each tenant can have custom schema modifications
- Good, because resource contention is eliminated
- Good, because backup/restore is tenant-specific
- Bad, because infrastructure costs scale linearly with tenants
- Bad, because schema migrations must run N times (once per tenant)
- Bad, because operational complexity increases dramatically
- Bad, because shared reporting/analytics becomes difficult
- Bad, because connection pool overhead scales with tenant count

### Schema-per-tenant

Separate PostgreSQL schema within single database.

- Good, because it provides namespace isolation
- Good, because queries are naturally scoped to schema
- Good, because per-tenant schema customization possible
- Bad, because schema migrations still require N iterations
- Bad, because Prisma doesn't support dynamic schema switching well
- Bad, because backup complexity increases
- Bad, because cross-tenant analytics requires complex queries

### Row-level isolation with RLS

Single database with tenant_id column and RLS policies.

- Good, because it's cost-efficient (single database)
- Good, because Supabase RLS provides database-level enforcement
- Good, because schema migrations are simple (one migration for all)
- Good, because Prisma integration is straightforward
- Good, because cross-tenant analytics is simple
- Good, because backup/restore is simple
- Bad, because all tenants share resources (noisy neighbor)
- Bad, because schema cannot be customized per tenant
- Bad, because queries have small overhead for tenant_id filter

### Hybrid approach

Shared tables for common data + tenant-specific tables for custom data.

- Good, because it balances sharing and customization
- Bad, because it's extremely complex to implement
- Bad, because migrations become complicated
- Bad, because application logic becomes convoluted
- Bad, because debugging is difficult

## Implementation Notes

### Database Schema

All multi-tenant tables include a `tenant_id` column:

```sql
-- Example: leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for tenant queries
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id, created_at DESC);

-- RLS policy
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON leads
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Prisma Middleware

Automatically inject tenant_id on all queries:

```typescript
// packages/db/src/middleware/tenant.middleware.ts
import { Prisma } from '@prisma/client';

export function tenantMiddleware(tenantId: string): Prisma.Middleware {
  return async (params, next) => {
    // Read operations: filter by tenant_id
    if (params.action === 'findUnique' || params.action === 'findFirst') {
      params.args.where = { ...params.args.where, tenant_id: tenantId };
    }
    if (params.action === 'findMany') {
      if (params.args.where) {
        params.args.where = { ...params.args.where, tenant_id: tenantId };
      } else {
        params.args.where = { tenant_id: tenantId };
      }
    }

    // Write operations: inject tenant_id
    if (params.action === 'create') {
      params.args.data = { ...params.args.data, tenant_id: tenantId };
    }
    if (params.action === 'createMany') {
      params.args.data = params.args.data.map((item: any) => ({
        ...item,
        tenant_id: tenantId,
      }));
    }

    return next(params);
  };
}
```

### tRPC Context

Extract tenant from authenticated user:

```typescript
// apps/api/src/trpc.ts
export const createContext = async ({ req }: CreateContextOptions) => {
  const session = await getServerSession(req);

  if (!session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // Extract tenant_id from user session
  const tenantId = session.user.tenant_id;

  const prisma = new PrismaClient();
  prisma.$use(tenantMiddleware(tenantId));

  // Set RLS context for Supabase
  await prisma.$executeRaw`SET app.current_tenant_id = ${tenantId}`;

  return { prisma, userId: session.user.id, tenantId };
};
```

### Tenant Table

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
```

### Tenant Settings

Tenant-specific configuration stored in JSONB:

```typescript
interface TenantSettings {
  branding: {
    logo_url: string;
    primary_color: string;
    company_name: string;
  };
  features: {
    ai_scoring_enabled: boolean;
    email_integration_enabled: boolean;
    custom_workflows_enabled: boolean;
  };
  limits: {
    max_users: number;
    max_leads_per_month: number;
    max_storage_gb: number;
  };
  integrations: {
    calendar_provider: 'google' | 'microsoft' | null;
    email_provider: 'gmail' | 'outlook' | null;
  };
}
```

### Validation Criteria

- [x] All multi-tenant tables have tenant_id column
- [x] RLS policies created for all multi-tenant tables
- [x] Prisma middleware automatically injects tenant_id
- [x] tRPC context includes tenantId from session
- [x] Integration tests verify cross-tenant isolation
- [x] Performance tests confirm query overhead <5ms
- [x] Documentation updated with multi-tenancy guide

### Security Testing

Test cases to verify tenant isolation:

1. **Direct Query Test**: Attempt to query data with wrong tenant_id (should
   return empty)
2. **SQL Injection Test**: Attempt to bypass RLS with malicious tenant_id
3. **API Test**: Use authenticated session to access other tenant's data (should
   fail)
4. **Middleware Bypass Test**: Raw Prisma query without middleware (should fail
   with RLS)

### Monitoring

Key metrics to track:

- Query performance by tenant (detect noisy neighbors)
- Database connection pool usage per tenant
- Storage usage per tenant (for billing)
- RLS policy evaluation time (should be <1ms)

### Migration Strategy

For existing data without tenant_id:

```sql
-- Step 1: Add nullable tenant_id
ALTER TABLE leads ADD COLUMN tenant_id UUID;

-- Step 2: Backfill with default tenant or migration script
UPDATE leads SET tenant_id = 'default-tenant-uuid' WHERE tenant_id IS NULL;

-- Step 3: Make non-nullable
ALTER TABLE leads ALTER COLUMN tenant_id SET NOT NULL;

-- Step 4: Add foreign key
ALTER TABLE leads ADD CONSTRAINT fk_leads_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Step 5: Enable RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
```

### Rollback Plan

If multi-tenancy causes issues:

1. Disable RLS policies temporarily:
   `ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;`
2. Remove Prisma middleware injection
3. Fall back to single-tenant mode with fixed tenant_id
4. Plan migration to database-per-tenant if required

## Links

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [Prisma Middleware](https://www.prisma.io/docs/concepts/components/prisma-client/middleware)
- Related: [ADR-007 Data Governance](./ADR-007-data-governance.md)
- [Sprint Plan: IFC-135](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)

## References

- [Multi-tenancy Patterns](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/overview)
- [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [GDPR Multi-tenancy Requirements](https://gdpr.eu/data-processing-agreement/)
