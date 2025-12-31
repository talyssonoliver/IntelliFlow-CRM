# Multi-Tenancy Architecture

**Status:** Implemented (IFC-127)
**Date:** 2025-12-29
**Related Tasks:** IFC-127 (Tenant Isolation), IFC-072 (Zero Trust Security)

## Overview

IntelliFlow CRM implements a comprehensive multi-tenant architecture that ensures complete data isolation between tenants at both the application and database layers. This document describes the isolation strategy, implementation details, and security guarantees.

## Tenancy Model

### Current Implementation: User-Level Tenancy

The current implementation uses **user-level tenancy** where each user is their own tenant:

```
Tenant = User
- Each user owns their data
- Data isolation enforced by ownerId field
- Managers can access subordinate users' data
- Admins have full access
```

### Future: Organization-Level Tenancy

The architecture is designed to evolve to organization-level tenancy:

```
Organization
  |-- User A (Admin)
  |-- User B (Manager)
  |     |-- User C (Sales Rep)
  |     |-- User D (User)
  |-- User E (User)
```

## Isolation Layers

Multi-tenant isolation is enforced at three layers:

### Layer 1: Application Layer (Primary)

**Implementation:** `apps/api/src/security/tenant-context.ts`

The tenant context middleware:
1. Extracts tenant identity from JWT claims
2. Injects tenant context into request context
3. Creates tenant-scoped Prisma client
4. Validates all operations against tenant boundaries

```typescript
// Usage in tRPC router
const tenantProcedure = protectedProcedure.use(tenantContextMiddleware());

tenantProcedure.query(async ({ ctx }) => {
  // ctx.tenant contains tenant context
  // ctx.prismaWithTenant is tenant-scoped
  const leads = await ctx.prismaWithTenant.lead.findMany();
});
```

### Layer 2: Database Layer (Defense-in-Depth)

**Implementation:**
- `packages/db/prisma/migrations/tenant-rls.sql`
- `infra/supabase/rls-policies.sql`

PostgreSQL Row Level Security (RLS) provides database-level enforcement:

```sql
-- Example: Users can only see their own leads
CREATE POLICY "leads_select_own"
  ON "leads"
  FOR SELECT
  USING ("ownerId" = auth.user_id());
```

RLS acts as the last line of defense - even if application code is bypassed, data isolation is maintained.

### Layer 3: Resource Limits (Fairness)

**Implementation:** `apps/api/src/security/tenant-limiter.ts`

Per-tenant resource limits prevent any single tenant from consuming excessive resources:

| Resource | Free | Starter | Professional | Enterprise |
|----------|------|---------|--------------|------------|
| Leads | 100 | 1,000 | 10,000 | 100,000 |
| Contacts | 100 | 1,000 | 10,000 | 100,000 |
| AI Scores/day | 10 | 100 | 500 | 5,000 |
| API Rate/min | 60 | 120 | 300 | 1,000 |
| Storage (MB) | 100 | 1,024 | 5,120 | 51,200 |

## Key Components

### TenantContext

The core tenant identity model:

```typescript
interface TenantContext {
  tenantId: string;           // Current tenant ID
  tenantType: 'user' | 'organization';
  userId: string;             // User within tenant
  role: string;               // User role
  organizationId?: string;    // Future: org-level tenancy
  canAccessAllTenantData: boolean;  // Admin/Manager flag
  teamMemberIds?: string[];   // For manager hierarchy
}
```

### Tenant-Scoped Prisma

The tenant-scoped Prisma extension automatically sets RLS context:

```typescript
const tenantPrisma = createTenantScopedPrisma(prisma, tenantContext);

// All queries through tenantPrisma automatically include tenant filter
await tenantPrisma.lead.findMany(); // Only returns current tenant's leads
```

### Access Control Helpers

```typescript
// Create WHERE clause with tenant filter
const where = createTenantWhereClause(tenant, { status: 'NEW' });
// Result: { status: 'NEW', ownerId: 'user-123' }

// Validate operation permissions
validateTenantOperation(tenant, 'create', { ownerId: 'other-user' });
// Throws if cross-tenant

// Check access to specific resource
const result = await verifyTenantAccess(ctx, resourceOwnerId);
// { allowed: boolean, reason?: string }
```

## Role-Based Access Model

### Access Hierarchy

| Role | Own Data | Team Data | All Data |
|------|----------|-----------|----------|
| USER | Yes | No | No |
| SALES_REP | Yes | No | No |
| MANAGER | Yes | Yes | No |
| ADMIN | Yes | Yes | Yes |

### Implementation

```typescript
function canAccessAllData(role: string): boolean {
  return ['ADMIN', 'MANAGER'].includes(role);
}

const ROLE_HIERARCHY = {
  USER: 1,
  SALES_REP: 2,
  MANAGER: 3,
  ADMIN: 4,
};
```

## Security Guarantees

### 1. Complete Data Isolation

- Each tenant's data is isolated by ownerId
- Cross-tenant queries are prevented at both app and DB layers
- No tenant can access another tenant's data

### 2. Privilege Escalation Prevention

- Users cannot modify their own role
- Role checks use SECURITY DEFINER functions
- JWT claims are verified server-side

### 3. Resource Fairness

- Per-tenant rate limiting
- Per-tenant resource quotas
- Concurrent request limits

### 4. Audit Trail

- All access attempts are logged
- Cross-tenant violations trigger security events
- Full audit history maintained

## API Usage

### tRPC Middleware

```typescript
import {
  tenantContextMiddleware,
  rateLimitMiddleware,
  resourceLimitMiddleware
} from './security';

// Create tenant-aware procedure
const tenantProcedure = protectedProcedure
  .use(tenantContextMiddleware())
  .use(rateLimitMiddleware());

// With resource limit check
const createLeadProcedure = tenantProcedure
  .use(resourceLimitMiddleware('leads'))
  .mutation(async ({ ctx, input }) => {
    // Automatically tenant-scoped
  });
```

### Manual Access Checks

```typescript
import { verifyTenantAccess, assertTenantContext } from './security';

async function updateLead(ctx: Context, leadId: string, data: LeadData) {
  assertTenantContext(ctx);

  const lead = await ctx.prisma.lead.findUnique({ where: { id: leadId } });

  const access = await verifyTenantAccess(ctx, lead.ownerId);
  if (!access.allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message: access.reason });
  }

  // Proceed with update
}
```

## Testing

### Unit Tests

Located at: `tests/security/tenant-isolation.test.ts`

```bash
pnpm --filter @intelliflow/api test:unit tenant-isolation
```

### Integration Tests

Located at: `tests/integration/cross-tenant.test.ts`

```bash
pnpm test:integration cross-tenant
```

### Test Scenarios

1. **Cross-Tenant Read Prevention**
   - User A cannot read User B's leads/contacts/accounts
   - Verified at both application and database layers

2. **Cross-Tenant Write Prevention**
   - User A cannot create resources for User B
   - User A cannot update User B's resources

3. **Role Hierarchy**
   - Manager can access team member data
   - Admin can access all data
   - Regular users limited to own data

4. **Resource Limits**
   - Limits enforced per tenant
   - Rate limiting per tenant
   - No cross-tenant impact

## Performance Considerations

### Database Indexes

All isolation keys are indexed for RLS performance:

```sql
CREATE INDEX idx_leads_owner ON leads("ownerId");
CREATE INDEX idx_contacts_owner ON contacts("ownerId");
-- etc.
```

### Caching

- Tenant context cached per request
- Team member IDs cached for managers
- Role checks use SECURITY DEFINER for plan caching

### Performance Targets

| Query Type | Target Latency |
|------------|----------------|
| Simple owner query | <10ms |
| Manager team query | <50ms |
| Cross-table EXISTS | <100ms |

## Monitoring

### Key Metrics

- Cross-tenant access attempts (should be 0)
- Tenant isolation violations
- Resource limit hits per tenant
- Rate limit hits per tenant

### Alerts

```yaml
- alert: CrossTenantAccessAttempt
  expr: cross_tenant_access_attempts > 0
  for: 1m
  severity: critical

- alert: TenantResourceLimit
  expr: tenant_resource_usage_percent > 90
  for: 5m
  severity: warning
```

## Migration Guide

### Adding New Tables

When adding new tables that require tenant isolation:

1. Add `ownerId` column to schema
2. Add RLS policies in migration
3. Create performance index
4. Update application layer checks

### Example Migration

```sql
-- 1. Add table with owner
CREATE TABLE "documents" (
  id TEXT PRIMARY KEY,
  "ownerId" TEXT NOT NULL REFERENCES users(id),
  -- other columns
);

-- 2. Enable RLS
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;

-- 3. Create policies
CREATE POLICY "documents_select_own" ON "documents"
  FOR SELECT USING ("ownerId" = auth.user_id());

-- 4. Create index
CREATE INDEX idx_documents_owner ON documents("ownerId");
```

## References

- [RLS Policies Documentation](./rls-policies.md)
- [Zero Trust Security ADR](../planning/adr/ADR-009-zero-trust-security.md)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

**Status:** Fully implemented with comprehensive testing. All isolation guarantees verified.
