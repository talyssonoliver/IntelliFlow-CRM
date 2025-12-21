# Multi-Tenant Isolation Strategy

**Status:** Design Complete (Sprint 1) **Date:** 2025-12-21 **Related ADR:**
ADR-009-zero-trust-security.md **Task:** IFC-072 (Zero Trust Security)

## Overview

This document defines the multi-tenant isolation strategy for IntelliFlow CRM.
The system is designed to support two tenancy models:

1. **User-Level Tenancy** (Current - Sprint 1-9): Each user owns their data
2. **Organization-Level Tenancy** (Future - Sprint 10+): Organizations own data,
   users are members

The isolation strategy ensures complete data separation between tenants using
PostgreSQL Row Level Security (RLS) combined with application-level
authorization.

## Tenancy Models

### Current Model: User-Level Tenancy

**Description:** Each user is an independent tenant. Data is isolated by
`ownerId` foreign key.

**Use Case:** Individual sales representatives, freelancers, small businesses

**Characteristics:**

- Users own leads, contacts, accounts, opportunities
- Managers can view team members' data (hierarchical access)
- Admins have full system access
- No concept of "organization" or "company"

**Data Model:**

```prisma
model Lead {
  id       String @id @default(cuid())
  email    String
  ownerId  String  // Isolation key
  owner    User    @relation(fields: [ownerId], references: [id])
  // ... other fields
}

model User {
  id    String   @id @default(cuid())
  email String   @unique
  role  UserRole @default(USER) // USER, SALES_REP, MANAGER, ADMIN
  leads Lead[]
}
```

**RLS Policy Example:**

```sql
-- Users can only see their own leads
CREATE POLICY "leads_select_own"
  ON "leads" FOR SELECT
  USING ("ownerId" = auth.user_id());

-- Managers can see team leads
CREATE POLICY "leads_select_manager"
  ON "leads" FOR SELECT
  USING (
    auth.is_manager()
    AND "ownerId" IN (SELECT auth.team_member_ids())
  );
```

**Advantages:**

- ✅ Simple to implement and understand
- ✅ Clear ownership model
- ✅ Suitable for MVP and early customers
- ✅ Easy to test and debug

**Limitations:**

- ❌ No organization-level features (company settings, shared resources)
- ❌ Cannot share data between users in same company
- ❌ Difficult to implement company-wide reports/analytics
- ❌ No centralized billing per organization

### Future Model: Organization-Level Tenancy

**Description:** Organizations own data. Users are members of organizations with
roles.

**Use Case:** Medium/large businesses, teams, SaaS multi-org

**Characteristics:**

- Organizations own leads, contacts, accounts, opportunities
- Users belong to one or more organizations
- Roles are organization-specific (user can be admin in Org A, user in Org B)
- Data shared within organization, isolated across organizations

**Data Model:**

```prisma
model Organization {
  id        String @id @default(cuid())
  name      String
  members   OrganizationMember[]
  leads     Lead[]
  contacts  Contact[]
  accounts  Account[]
}

model OrganizationMember {
  userId         String
  user           User   @relation(fields: [userId], references: [id])
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  role           OrgRole // ORG_ADMIN, ORG_MANAGER, ORG_MEMBER

  @@id([userId, organizationId])
}

model Lead {
  id             String       @id @default(cuid())
  email          String
  ownerId        String       // User who created it
  owner          User         @relation(fields: [ownerId], references: [id])
  organizationId String       // Isolation key
  organization   Organization @relation(fields: [organizationId], references: [id])
  // ... other fields
}
```

**RLS Policy Example:**

```sql
-- Users can see leads in their organization
CREATE POLICY "leads_select_org"
  ON "leads" FOR SELECT
  USING (
    "organizationId" IN (
      SELECT organizationId FROM organization_members
      WHERE userId = auth.user_id()
    )
  );

-- Org admins can see all org leads
CREATE POLICY "leads_select_org_admin"
  ON "leads" FOR SELECT
  USING (
    auth.is_org_admin("organizationId")
  );
```

**Advantages:**

- ✅ True multi-tenancy (organization isolation)
- ✅ Shared data within organization
- ✅ Centralized billing per organization
- ✅ Company-wide analytics and reporting
- ✅ User can belong to multiple organizations

**Limitations:**

- ❌ More complex to implement
- ❌ Requires migration of existing data
- ❌ Performance implications (more joins)
- ❌ User identity management across orgs

## Isolation Mechanisms

### 1. Database Level: Row Level Security (RLS)

**Primary Isolation Layer**

PostgreSQL RLS policies enforce tenant isolation at the database level. Even if
application code is compromised, users cannot access other tenants' data.

**Key Features:**

- Automatic enforcement (no manual filters needed)
- Works with all query types (SELECT, INSERT, UPDATE, DELETE)
- Leverages JWT claims for user context
- Service role can bypass RLS for system operations

**Implementation:**

```sql
-- Enable RLS on table
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;

-- Define policies for each operation
CREATE POLICY "leads_select_own" ON "leads" FOR SELECT
  USING ("ownerId" = auth.user_id());

CREATE POLICY "leads_insert_own" ON "leads" FOR INSERT
  WITH CHECK ("ownerId" = auth.user_id());
```

**Performance:**

- RLS overhead: <10ms for indexed queries
- Relies on `ownerId` indexes (all created in schema)
- SECURITY DEFINER functions cache query plans

### 2. Application Level: Authorization Middleware

**Secondary Isolation Layer**

tRPC middleware validates user permissions before executing queries. Provides
better error messages and reduces database load.

**Implementation:**

```typescript
// Protected procedure middleware
const isAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // Attach user context to all queries
  return next({
    ctx: {
      user: ctx.user,
      prisma: prismaWithRLS(ctx.user.id),
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

**Benefits:**

- Better error messages (fail fast at API layer)
- Can implement complex business logic
- Reduces unnecessary DB queries
- Easier debugging (TypeScript stack traces)

### 3. Frontend Level: UI Access Control

**Tertiary Isolation Layer**

Frontend hides unauthorized UI elements and validates actions. Provides better
UX but is NOT a security boundary.

**Implementation:**

```typescript
// React component with role-based rendering
function LeadActions({ lead }) {
  const { user } = useAuth();
  const canEdit = lead.ownerId === user.id || user.role === 'ADMIN';

  return (
    <>
      {canEdit && <EditButton />}
      {user.role === 'ADMIN' && <DeleteButton />}
    </>
  );
}
```

**Important:** Frontend access control is for UX only. Always enforce at API/DB
level.

## Tenant Context Management

### JWT Token Structure

Supabase Auth issues JWT tokens containing user identity and role:

```json
{
  "sub": "user-123", // User ID (primary identifier)
  "email": "user@example.com",
  "role": "authenticated", // Supabase role (authenticated/anon)
  "app_metadata": {
    "role": "MANAGER" // Application role (USER/MANAGER/ADMIN)
  },
  "user_metadata": {
    "organizationId": "org-456" // Future: Current organization
  }
}
```

### Setting Tenant Context in Queries

**Prisma Extension:**

```typescript
// Prisma extension to set RLS context
function prismaWithRLS(userId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Set PostgreSQL session variable
          await prisma.$executeRawUnsafe(
            `SET request.jwt.claims = '{"sub": "${userId}"}'`
          );

          // Execute query (RLS policies will enforce isolation)
          return query(args);
        },
      },
    },
  });
}
```

**Session Variables:**

PostgreSQL session variables store JWT claims for RLS policy evaluation:

```sql
-- Application sets this before each query
SET request.jwt.claims = '{"sub": "user-123"}';

-- RLS policies read this value
CREATE FUNCTION auth.user_id() RETURNS TEXT AS $$
  SELECT (current_setting('request.jwt.claims')::json->>'sub')::text;
$$ LANGUAGE SQL STABLE;
```

### Service Role (RLS Bypass)

Backend operations (AI scoring, batch jobs, migrations) use service role key
which bypasses ALL RLS policies.

**When to Use Service Role:**

- ✅ AI scoring pipeline (writes ai_scores table)
- ✅ Batch data imports
- ✅ Database migrations
- ✅ Cross-tenant analytics (admin dashboard)
- ✅ Automated cleanup jobs

**Security Rules:**

- Store service role key in environment variables
- NEVER expose to frontend
- Audit all service role operations
- Rotate key every 90 days

## Migration Path: User-Tenancy → Org-Tenancy

### Phase 1: Add Organization Tables (Sprint 10)

```sql
-- Create organization tables
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP NOT NULL
);

CREATE TABLE organization_members (
  userId TEXT REFERENCES users(id),
  organizationId TEXT REFERENCES organizations(id),
  role TEXT NOT NULL, -- ORG_ADMIN, ORG_MANAGER, ORG_MEMBER
  joinedAt TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (userId, organizationId)
);

-- Create indexes
CREATE INDEX idx_org_members_user ON organization_members(userId);
CREATE INDEX idx_org_members_org ON organization_members(organizationId);
```

### Phase 2: Backfill Data (Sprint 11)

```sql
-- Create one organization per existing user
INSERT INTO organizations (id, name)
SELECT
  'org-' || id as id,
  COALESCE(name, email) || '''s Organization' as name
FROM users;

-- Add users as admins of their orgs
INSERT INTO organization_members (userId, organizationId, role)
SELECT
  id as userId,
  'org-' || id as organizationId,
  'ORG_ADMIN' as role
FROM users;

-- Add organizationId to all CRM tables
ALTER TABLE leads ADD COLUMN organizationId TEXT REFERENCES organizations(id);
ALTER TABLE contacts ADD COLUMN organizationId TEXT REFERENCES organizations(id);
ALTER TABLE accounts ADD COLUMN organizationId TEXT REFERENCES organizations(id);
ALTER TABLE opportunities ADD COLUMN organizationId TEXT REFERENCES organizations(id);

-- Backfill organizationId from ownerId
UPDATE leads SET organizationId = 'org-' || ownerId;
UPDATE contacts SET organizationId = 'org-' || ownerId;
UPDATE accounts SET organizationId = 'org-' || ownerId;
UPDATE opportunities SET organizationId = 'org-' || ownerId;

-- Make organizationId NOT NULL
ALTER TABLE leads ALTER COLUMN organizationId SET NOT NULL;
-- ... (repeat for other tables)

-- Create indexes
CREATE INDEX idx_leads_org ON leads(organizationId);
CREATE INDEX idx_contacts_org ON contacts(organizationId);
CREATE INDEX idx_accounts_org ON accounts(organizationId);
CREATE INDEX idx_opportunities_org ON opportunities(organizationId);
```

### Phase 3: Update RLS Policies (Sprint 12)

```sql
-- Drop old policies
DROP POLICY "leads_select_own" ON leads;
DROP POLICY "leads_select_manager" ON leads;

-- Create new org-based policies
CREATE POLICY "leads_select_org_member"
  ON leads FOR SELECT
  USING (
    "organizationId" IN (
      SELECT organizationId FROM organization_members
      WHERE userId = auth.user_id()
    )
  );

-- Org admins can edit all org leads
CREATE POLICY "leads_update_org_admin"
  ON leads FOR UPDATE
  USING (
    auth.is_org_admin("organizationId")
  )
  WITH CHECK (
    auth.is_org_admin("organizationId")
  );

-- Regular members can only edit their own leads
CREATE POLICY "leads_update_own"
  ON leads FOR UPDATE
  USING (
    "ownerId" = auth.user_id()
    AND "organizationId" IN (
      SELECT organizationId FROM organization_members
      WHERE userId = auth.user_id()
    )
  )
  WITH CHECK (
    "ownerId" = auth.user_id()
  );
```

### Phase 4: Helper Functions (Sprint 12)

```sql
-- Get user's organization IDs
CREATE FUNCTION auth.user_organization_ids()
RETURNS SETOF TEXT AS $$
  SELECT organizationId FROM organization_members
  WHERE userId = auth.user_id();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check if user is admin of specific org
CREATE FUNCTION auth.is_org_admin(org_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE userId = auth.user_id()
      AND organizationId = org_id
      AND role = 'ORG_ADMIN'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Get current organization from JWT
CREATE FUNCTION auth.current_organization_id()
RETURNS TEXT AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->'user_metadata'->>'organizationId',
    ''
  )::text;
$$ LANGUAGE SQL STABLE;
```

### Phase 5: Application Updates (Sprint 13)

```typescript
// Update tRPC context to include organization
export async function createContext({ req }: CreateContextOptions) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const user = await verifyToken(token);

  // Get user's organizations
  const orgs = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    include: { organization: true },
  });

  return {
    user,
    organizations: orgs,
    currentOrg: orgs[0]?.organization, // Default to first org
  };
}

// Update Prisma queries to filter by org
export const leadRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.lead.findMany({
      where: {
        organizationId: ctx.currentOrg.id, // RLS also enforces this
      },
    });
  }),
});
```

## Cross-Tenant Access Prevention

### Attack Vectors and Mitigations

#### 1. Direct Parameter Manipulation

**Attack:** User modifies API parameters to access other tenant's data

```typescript
// Attacker tries to access another org's lead
trpc.lead.getById.query({ id: 'other-org-lead-123' });
```

**Mitigation:**

- RLS policy prevents query from returning rows
- Application middleware validates ownership
- Returns null or throws UNAUTHORIZED error

#### 2. SQL Injection

**Attack:** Inject SQL to bypass filters

```sql
-- Attacker input: "123' OR '1'='1"
SELECT * FROM leads WHERE id = '123' OR '1'='1';
```

**Mitigation:**

- Prisma uses parameterized queries (prevents injection)
- RLS policies still enforce isolation even if injection succeeds
- Input validation in Zod schemas

#### 3. Service Role Key Theft

**Attack:** Attacker steals service role key, bypasses RLS

**Mitigation:**

- Store key in environment variables (never in code)
- Use secret management (HashiCorp Vault, AWS Secrets Manager)
- Rotate keys every 90 days
- Monitor service role API calls for anomalies

#### 4. JWT Token Tampering

**Attack:** Modify JWT to impersonate another user

**Mitigation:**

- JWTs are cryptographically signed (cannot modify without secret)
- Signature validation fails for tampered tokens
- Short token expiry (15 minutes for access tokens)
- Refresh token rotation

#### 5. Privilege Escalation

**Attack:** User changes own role to ADMIN

**Mitigation:**

- RLS policy prevents role modification on `users` table
- Application middleware validates role changes (admin-only)
- Audit logging captures all role change attempts

## Testing Strategy

### Unit Tests (RLS Policies)

```sql
-- Test 1: User can only see own leads
SET request.jwt.claims = '{"sub": "user-1"}';

-- Should return only user-1's leads
SELECT COUNT(*) FROM leads;

-- Should return 0 (user-2's lead not visible)
SELECT COUNT(*) FROM leads WHERE "ownerId" = 'user-2';

RESET request.jwt.claims;
```

### Integration Tests (Application)

```typescript
describe('Multi-Tenant Isolation', () => {
  it('prevents cross-tenant access', async () => {
    // Setup: User 1 creates lead
    const user1Client = createTRPCClient({ userId: 'user-1' });
    const lead = await user1Client.lead.create.mutate({
      email: 'test@example.com',
    });

    // Test: User 2 cannot access user 1's lead
    const user2Client = createTRPCClient({ userId: 'user-2' });
    const result = await user2Client.lead.getById.query({ id: lead.id });

    expect(result).toBeNull(); // RLS blocks access
  });

  it('allows manager to view team leads', async () => {
    // Setup: Team member creates lead
    const memberClient = createTRPCClient({ userId: 'team-member-1' });
    const lead = await memberClient.lead.create.mutate({
      email: 'test@example.com',
    });

    // Test: Manager can access team lead
    const managerClient = createTRPCClient({ userId: 'manager-1' });
    const result = await managerClient.lead.getById.query({ id: lead.id });

    expect(result).toBeDefined();
    expect(result.id).toBe(lead.id);
  });
});
```

### Security Audit Tests

```typescript
describe('Security Audit', () => {
  it('blocks privilege escalation', async () => {
    const userClient = createTRPCClient({ userId: 'user-1', role: 'USER' });

    // Attempt to change own role
    await expect(
      userClient.user.update.mutate({
        id: 'user-1',
        role: 'ADMIN', // Should fail
      })
    ).rejects.toThrow('FORBIDDEN');
  });

  it('logs unauthorized access attempts', async () => {
    const user2Client = createTRPCClient({ userId: 'user-2' });

    // Attempt to access user-1's lead
    await user2Client.lead.getById.query({ id: 'user-1-lead' });

    // Check audit log
    const logs = await prisma.auditLog.findMany({
      where: {
        userId: 'user-2',
        action: 'UNAUTHORIZED_ACCESS',
      },
    });

    expect(logs).toHaveLength(1);
  });
});
```

## Performance Considerations

### RLS Impact on Query Performance

| Scenario                       | Complexity | Expected Latency | Optimization Strategy   |
| ------------------------------ | ---------- | ---------------- | ----------------------- |
| Simple owner query             | Low        | <10ms            | Index on ownerId        |
| Manager team query             | Medium     | <50ms            | Materialized view       |
| Cross-table access (ai_scores) | High       | <100ms           | Optimize EXISTS clause  |
| Org-level query (future)       | Medium     | <30ms            | Index on organizationId |

### Optimization Techniques

1. **Indexes on Isolation Keys**

   ```sql
   CREATE INDEX idx_leads_owner ON leads(ownerId);
   CREATE INDEX idx_leads_org ON leads(organizationId);
   ```

2. **SECURITY DEFINER Functions**

   ```sql
   -- Cache query plans
   CREATE FUNCTION auth.user_id()
   RETURNS TEXT AS $$ ... $$
   LANGUAGE SQL STABLE SECURITY DEFINER;
   ```

3. **Materialized Views for Team Hierarchies**

   ```sql
   CREATE MATERIALIZED VIEW team_members AS
   SELECT managerId, userId FROM team_structure;

   REFRESH MATERIALIZED VIEW team_members; -- Run daily
   ```

4. **Query Plan Analysis**
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM leads WHERE "ownerId" = 'user-123';
   -- Verify index usage
   ```

## Monitoring and Auditing

### Metrics to Track

1. **RLS Policy Performance**
   - Query latency by table (target: <50ms)
   - RLS overhead vs baseline (target: <10ms)
   - Slow queries with RLS (>100ms)

2. **Security Events**
   - Failed access attempts per user
   - Cross-tenant access attempts
   - Service role API calls
   - Role change attempts

3. **Tenant Isolation**
   - Successful RLS policy enforcement (100%)
   - Cross-tenant queries blocked per day
   - Data leak incidents (target: 0)

### Audit Logging

```typescript
// Middleware to log all access attempts
const auditLogger = t.middleware(async ({ ctx, path, type, next }) => {
  const result = await next().catch((error) => {
    // Log failed access
    await prisma.auditLog.create({
      data: {
        userId: ctx.user.id,
        action: `${type}_${path}`,
        entityType: 'UNKNOWN',
        entityId: '',
        ipAddress: ctx.req.ip,
        metadata: { error: error.message },
      },
    });
    throw error;
  });

  // Log successful access
  await prisma.auditLog.create({
    data: {
      userId: ctx.user.id,
      action: `${type}_${path}`,
      entityType: extractEntityType(path),
      entityId: extractEntityId(result),
      ipAddress: ctx.req.ip,
    },
  });

  return result;
});
```

## References

- [RLS Design Document](./rls-design.md)
- [ADR-009: Zero Trust Security](../planning/adr/ADR-009-zero-trust-security.md)
- [ADR-004: Multi-Tenancy](../planning/adr/ADR-004-multi-tenancy.md)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Auth & RLS](https://supabase.com/docs/guides/auth/row-level-security)

---

**Conclusion:** IntelliFlow CRM's multi-tenant isolation strategy provides
comprehensive protection against cross-tenant data access through defense in
depth (RLS + application auth + UI controls). The current user-level tenancy
model supports MVP requirements with a clear migration path to
organization-level tenancy in later sprints.

**Status:** ✅ Design complete - Ready for implementation in Sprint 2-3
