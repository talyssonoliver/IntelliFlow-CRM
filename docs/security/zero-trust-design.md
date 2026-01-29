# Zero Trust Security Design

**Status:** Implemented (Sprint 1) **Related ADR:**
[ADR-009: Zero Trust Security](../planning/adr/ADR-009-zero-trust-security.md)
**Task:** IFC-072

## Overview

IntelliFlow CRM implements a zero trust security model following the principle:
"Never trust, always verify." This design ensures that even if one layer is
compromised, data remains protected through defense in depth.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: UI Access Control                                     │
│  - Route guards based on user role                              │
│  - Component-level visibility controls                          │
│  - Optimistic UI (not security boundary)                        │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: API Authentication (tRPC + Supabase Auth)             │
│  - JWT validation on every request                              │
│  - Role extraction from token claims                            │
│  - Session management with refresh tokens                       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: API Authorization (tRPC Middleware)                   │
│  - Route-level permission checks                                │
│  - Input validation with Zod schemas                            │
│  - Rate limiting per user/IP                                    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 4: Database RLS (PostgreSQL)                             │
│  - Row-level security policies                                  │
│  - Automatic tenant isolation                                   │
│  - Role-based data access                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Security Layers

### Layer 1: UI Access Control

- **Implementation**: React Router guards, conditional rendering
- **Purpose**: User experience optimization
- **NOT a security boundary**: Backend must always validate

### Layer 2: API Authentication

- **Provider**: Supabase Auth (JWT-based)
- **Token format**: JWT with user_id, email, role claims
- **Validation**: Every tRPC request validates JWT signature

```typescript
// apps/api/src/middleware/auth.ts
export const authMiddleware = t.middleware(async ({ ctx, next }) => {
  const token = ctx.req.headers.authorization?.split(' ')[1];
  const user = await verifyJWT(token);
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user } });
});
```

### Layer 3: API Authorization

- **Route-level checks**: Permission decorators on procedures
- **Input validation**: Zod schemas prevent injection
- **Rate limiting**: Tiered limits with DDoS protection (IFC-114)
  - Public: 100 req/min
  - Authenticated: 1000 req/min
  - AI endpoints: 10 req/min
  - Auth endpoints: 5 req/min (brute force protection)

```typescript
// Permission check example
export const leadsRouter = router({
  update: protectedProcedure
    .input(updateLeadSchema)
    .use(requirePermission('leads:write'))
    .mutation(async ({ ctx, input }) => {
      // RLS enforces user can only update their leads
    }),
});
```

### Layer 4: Database RLS

- **Automatic enforcement**: PostgreSQL policies
- **Tenant isolation**: user_id comparison in every query
- **Role escalation**: Managers can see team data

See [RLS Design](./rls-design.md) for detailed policies.

## Trust Boundaries

| Boundary          | Trust Level       | Verification              |
| ----------------- | ----------------- | ------------------------- |
| Browser → API     | Zero trust        | JWT validation            |
| API → Database    | Verified identity | RLS policies              |
| Service → Service | mTLS (future)     | Certificate validation    |
| External API      | Zero trust        | API key + request signing |

## Security Controls

### Authentication

- [x] Supabase Auth integration
- [x] JWT validation middleware
- [x] Session refresh flow
- [ ] MFA support (Sprint 4)

### Authorization

- [x] Role-based access (USER, SALES_REP, MANAGER, ADMIN)
- [x] Route-level permissions
- [x] RLS policies for all tables
- [ ] Attribute-based access (Sprint 6)

### Data Protection

- [x] Encryption at rest (Supabase default)
- [x] Encryption in transit (TLS 1.3)
- [x] Sensitive field masking in logs
- [ ] Field-level encryption (Sprint 8)

### Audit

- [x] OpenTelemetry tracing
- [x] Security event logging
- [x] Failed auth attempt tracking
- [ ] Compliance audit reports (Sprint 5)

## Incident Response

In case of suspected breach:

1. **Immediate**: Revoke affected JWT tokens
2. **Contain**: Enable enhanced RLS (read-only mode)
3. **Investigate**: Query audit logs for unauthorized access
4. **Remediate**: Patch vulnerability, rotate secrets
5. **Report**: Generate compliance report

## Related Documents

- [ADR-009: Zero Trust Security](../planning/adr/ADR-009-zero-trust-security.md)
- [RLS Design](./rls-design.md)
- [Multi-Tenant Isolation](./multi-tenant-isolation.md)
- [OWASP Checklist](./owasp-checklist.md)
