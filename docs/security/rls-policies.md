# Row-Level Security (RLS) Policies

## Overview

This document describes the Row-Level Security policies for IntelliFlow CRM tenant isolation, implementing IFC-127.

## Policy Definitions

### Lead Table RLS

```sql
-- Enable RLS on leads table
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see leads they own
CREATE POLICY "leads_user_isolation" ON leads
  FOR ALL
  USING (
    owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    OR
    (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

-- Policy: Managers can see team leads
CREATE POLICY "leads_manager_access" ON leads
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'MANAGER'
    AND owner_id IN (
      SELECT id FROM users WHERE role IN ('USER', 'SALES_REP')
    )
  );
```

### Contact Table RLS

```sql
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_user_isolation" ON contacts
  FOR ALL
  USING (
    owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    OR
    (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );
```

### Account Table RLS

```sql
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_user_isolation" ON accounts
  FOR ALL
  USING (
    owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    OR
    (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );
```

### Opportunity Table RLS

```sql
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opportunities_user_isolation" ON opportunities
  FOR ALL
  USING (
    owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    OR
    (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );
```

### Task Table RLS

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_user_isolation" ON tasks
  FOR ALL
  USING (
    owner_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    OR assigned_to_id = (current_setting('request.jwt.claims', true)::json->>'sub')::uuid
    OR
    (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );
```

### Audit Log Table RLS

```sql
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "audit_logs_admin_only" ON audit_logs
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'role') IN ('ADMIN', 'SERVICE')
  );

-- All authenticated users can insert audit logs
CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT
  WITH CHECK (true);
```

## Application Layer Enforcement

See `apps/api/src/security/tenant-context.ts` for application-layer tenant isolation:

```typescript
// Middleware extracts tenant context from JWT
const tenant = extractTenantContext(user);

// Prisma extension sets RLS context before each query
await prisma.$executeRawUnsafe(
  `SET request.jwt.claims = '${claims}'`
);
```

## Testing

```bash
# Run tenant isolation tests
pnpm --filter @intelliflow/api test -- --grep "tenant"
pnpm --filter @intelliflow/api test:integration
```

## Verification Checklist

| Table | RLS Enabled | User Policy | Admin Policy | Tested |
|-------|-------------|-------------|--------------|--------|
| leads | Yes | Yes | Yes | Yes |
| contacts | Yes | Yes | Yes | Yes |
| accounts | Yes | Yes | Yes | Yes |
| opportunities | Yes | Yes | Yes | Yes |
| tasks | Yes | Yes | Yes | Yes |
| audit_logs | Yes | No (admin only) | Yes | Yes |

---

*Task: IFC-127 - Tenant Isolation*
*Created: 2025-12-29*
