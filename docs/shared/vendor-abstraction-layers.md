# Vendor Abstraction Layers

**Document ID**: IFC-057
**Status**: Completed
**Last Updated**: 2025-12-29
**Purpose**: Document abstraction layers for critical vendor dependencies to enable vendor portability

## Overview

IntelliFlow CRM is architected with explicit abstraction layers to minimize vendor lock-in across three critical infrastructure domains:

1. **Database** (Supabase → PostgreSQL)
2. **Authentication** (Supabase Auth → Any OAuth2/OIDC provider)
3. **Hosting** (Vercel → Any Node.js host)

This document outlines the abstraction boundaries and migration paths for each vendor relationship.

---

## 1. Database Abstraction Layer

### Current Implementation

**Vendor**: Supabase (PostgreSQL managed service)
**ORM**: Prisma

### Abstraction Architecture

```
┌─────────────────────────────────────────┐
│         Domain Layer                    │
│  (Pure business logic, no ORM)          │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│      Application Layer (Ports)          │
│  - LeadRepository (interface)           │
│  - ContactRepository (interface)        │
│  - AccountRepository (interface)        │
│  - OpportunityRepository (interface)    │
│  - TaskRepository (interface)           │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│      Adapters Layer (Implementations)   │
│  - PrismaLeadRepository                 │
│  - InMemoryLeadRepository               │
│  - TypeORMLeadRepository (future)       │
│  - MongoLeadRepository (future)         │
└─────────────────────────────────────────┘
```

### Repository Pattern

All repositories follow the **Repository Pattern** with clear interface definitions:

**Location**: `packages/application/src/ports/repositories/`

Example: `LeadRepositoryPort.ts`
```typescript
export type LeadRepository = {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
  findByEmail(email: Email): Promise<Lead | null>;
  findAll(): Promise<Lead[]>;
  delete(id: LeadId): Promise<void>;
};
```

**Implementation**: `packages/adapters/src/repositories/PrismaLeadRepository.ts`
```typescript
export class PrismaLeadRepository implements LeadRepository {
  constructor(private readonly prisma: PrismaClient) {}
  // Implementation using Prisma
}
```

### Database Migration Path

To migrate from Supabase PostgreSQL to alternative database:

**Step 1**: Implement new repository adapter
- Create `packages/adapters/src/repositories/TypeORMLeadRepository.ts`
- Implement `LeadRepository` interface
- No changes to domain or application layers required

**Step 2**: Update dependency injection
- Replace `PrismaLeadRepository` with `TypeORMLeadRepository` in composition root
- Location: `apps/api/src/composition-root.ts` (or DI container)

**Step 3**: Data migration
- Export data from PostgreSQL using Prisma
- Transform to target database schema
- Load into new database
- Run validation tests

**Step 4**: Validate
- Run repository integration tests
- Verify data consistency
- Switch production traffic

### Supported ORM Alternatives

| Database | ORM | Status | Migration Effort |
|----------|-----|--------|------------------|
| PostgreSQL | Prisma | ✅ Current | Baseline |
| PostgreSQL | TypeORM | 📋 Ready | 1-2 weeks |
| PostgreSQL | Sequelize | 📋 Possible | 2-3 weeks |
| MySQL | Prisma | 📋 Possible | 1-2 weeks |
| MongoDB | Mongoose | 📋 Possible | 3-4 weeks |
| DynamoDB | AWS SDK | 📋 Possible | 4+ weeks |

---

## 2. Authentication Abstraction Layer

### Current Implementation

**Vendor**: Supabase Auth (SAML, OAuth2)
**Current Providers**: Email/Password, Google, GitHub

### Abstraction Architecture

```
┌─────────────────────────────────────┐
│   Application Layer (Ports)         │
│  - AuthenticationPort               │
│  - AuthorizationPort                │
│  - TokenManagementPort              │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│   Adapters Layer (Implementations)  │
│  - SupabaseAuthAdapter              │
│  - Auth0Adapter (future)            │
│  - KeycloakAdapter (future)         │
│  - OktaAdapter (future)             │
└─────────────────────────────────────┘
```

### Authentication Port Definition

**Location**: `packages/application/src/ports/external/authentication/`

```typescript
export interface AuthenticationPort {
  // OAuth2/OIDC login initiation
  initiateLogin(provider: string, redirectUrl: string): Promise<LoginInitiation>;

  // Token exchange
  exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenSet>;

  // User info retrieval
  getUserInfo(accessToken: string): Promise<UserInfo>;

  // Token validation
  validateToken(token: string): Promise<TokenValidation>;

  // Token refresh
  refreshToken(refreshToken: string): Promise<TokenSet>;

  // Logout
  logout(userId: string): Promise<void>;
}

export interface AuthorizationPort {
  // Check user permissions
  checkPermission(userId: string, resource: string, action: string): Promise<boolean>;

  // Get user roles
  getUserRoles(userId: string): Promise<string[]>;
}
```

### Authentication Migration Path

To migrate from Supabase to alternative provider:

**Step 1**: Implement new authentication adapter
- Create `packages/adapters/src/external/authentication/Auth0AuthAdapter.ts`
- Implement `AuthenticationPort` interface
- Handle OIDC/OAuth2 flows

**Step 2**: Update authentication configuration
- Replace Supabase client initialization with new provider client
- Location: `apps/api/src/config/auth.config.ts`

**Step 3**: Update frontend authentication
- Replace Supabase Auth UI with new provider SDK
- Location: `apps/web/src/lib/auth.ts`

**Step 4**: Data migration (optional)
- If provider requires user sync:
  - Export users from Supabase
  - Import to new provider
  - Update user records with new provider IDs

**Step 5**: Validate
- Test login/logout flows
- Verify token generation and validation
- Test role-based access control (RBAC)

### Supported Authentication Providers

| Provider | Type | Status | Migration Effort |
|----------|------|--------|------------------|
| Supabase Auth | OAuth2/OIDC | ✅ Current | Baseline |
| Auth0 | OAuth2/OIDC | 📋 Ready | 1-2 weeks |
| Keycloak | OAuth2/OIDC | 📋 Ready | 1-2 weeks |
| Okta | OAuth2/OIDC | 📋 Possible | 2 weeks |
| AWS Cognito | OAuth2/OIDC | 📋 Possible | 2 weeks |
| Azure AD | OAuth2/OIDC | 📋 Possible | 2 weeks |
| Clerk | OAuth2 | 📋 Possible | 1 week |
| Firebase Auth | Custom | 📋 Possible | 2-3 weeks |

---

## 3. Hosting Abstraction Layer

### Current Implementation

**Vendor**: Vercel (Next.js hosting)
**Components**: Frontend (apps/web), API (apps/api), Project Tracker (apps/project-tracker)

### Abstraction Architecture

```
┌──────────────────────────────────┐
│   Application Layer              │
│  - API routes (tRPC)             │
│  - Server components             │
│  - Environment variables         │
└──────────────┬───────────────────┘
               │
┌──────────────▼───────────────────┐
│   Platform Abstraction Layer     │
│  - Entry point functions         │
│  - Build configuration           │
│  - Environment handling          │
└──────────────────────────────────┘
```

### Hosting-Agnostic Patterns

**1. Environment Variables**
- All configuration via `.env` files
- No hardcoded URLs or secrets
- Supports both local and cloud environments

**Location**:
- `.env.example` - Template
- `.env.local` - Local overrides
- `.env.production` - Production secrets (never committed)

**2. Build Configuration**
- Standard Node.js/npm ecosystem
- `package.json` scripts work on any Node.js host
- No Vercel-specific APIs (except optional: Image Optimization)

**3. API Routes**
- Next.js API routes as standard Node.js handlers
- Deployable to any Node.js runtime

### Hosting Migration Path

To migrate from Vercel to alternative host:

**Step 1**: Choose target platform
- AWS Lambda/EC2 (traditional or serverless)
- Google Cloud Run
- Azure App Service
- Self-hosted (Docker/Kubernetes)
- DigitalOcean App Platform
- Railway
- Render

**Step 2**: Build and test locally
```bash
# Build production artifact
pnpm run build

# Test build locally (Next.js standalone mode)
node .next/standalone/server.js
```

**Step 3**: Prepare deployment configuration
- Docker: Create Dockerfile (use Node.js image)
- Environment variables: Set secrets in new platform
- Database: Update DATABASE_URL connection string
- CDN: Configure static assets distribution (if needed)

**Step 4**: Deploy and validate
- Deploy application
- Verify environment variables are loaded
- Test critical API endpoints
- Run smoke tests

**Step 5**: Traffic migration
- Set up gradual traffic shift (if blue/green available)
- Monitor error rates
- Verify performance metrics

### Supported Hosting Alternatives

| Platform | Type | Build Time | Serverless? | Status | Migration Effort |
|----------|------|-----------|-------------|--------|------------------|
| Vercel | PaaS | < 2min | Yes | ✅ Current | Baseline |
| Railway | PaaS | < 5min | No | 📋 Ready | < 1 week |
| Render | PaaS | < 5min | No | 📋 Ready | < 1 week |
| AWS Lambda | Serverless | < 2min | Yes | 📋 Possible | 1-2 weeks |
| Google Cloud Run | Serverless | < 2min | Yes | 📋 Possible | 1-2 weeks |
| DigitalOcean App | PaaS | < 5min | No | 📋 Ready | < 1 week |
| Self-hosted Docker | On-premise | Custom | No | 📋 Possible | 2-3 weeks |

---

## 4. Cross-Cutting Concerns

### Configuration Management

**Pattern**: Environment-based configuration
```
apps/*/
├── .env.example          # Template (always committed)
├── .env.local            # Local overrides (never committed)
├── .env.staging          # Staging secrets
└── .env.production       # Production secrets (in secure vault)
```

**Best Practices**:
- No hardcoded vendor endpoints
- Use feature flags for gradual rollouts
- Vault-based secrets management (HashiCorp Vault setup in EXC-SEC-001)

### Observability

All vendors provide similar observability:
- Structured logging (winston/pino)
- Distributed tracing (OpenTelemetry)
- Metrics collection (Prometheus)
- Error tracking (Sentry)

**No vendor-specific observability locks exist.**

### Testing Strategy

**Unit Tests**: Mock repository interfaces, no real vendor calls
**Integration Tests**: Use testcontainers (PostgreSQL in Docker)
**End-to-End Tests**: Can run against any deployed instance

**Test Database Setup**:
```bash
# Start PostgreSQL container for testing
docker-compose -f docker-compose.test.yml up

# Run integration tests
pnpm run test:integration

# Tests use DATABASE_URL pointing to container
```

---

## 5. Risk Assessment

### Low Risk Migrations (< 1 week)

- Database: PostgreSQL → PostgreSQL on AWS RDS
- Authentication: Supabase → Auth0
- Hosting: Vercel → Railway

### Medium Risk Migrations (1-3 weeks)

- Database: PostgreSQL → MySQL
- Authentication: Supabase → Okta
- Hosting: Vercel → AWS Lambda

### High Risk Migrations (3+ weeks)

- Database: PostgreSQL → MongoDB (document model change required)
- Authentication: OAuth2 → SAML-only (requires RBAC redesign)
- Hosting: Vercel → Self-hosted Kubernetes (operational complexity)

---

## 6. Migration Decision Matrix

**When to migrate?**

| Scenario | Decision | Timeline |
|----------|----------|----------|
| Cost optimization | Evaluate at Sprint 12+ | 1-2 weeks |
| Vendor pricing increase | Evaluate if > 30% increase | 2-4 weeks |
| Data residency requirement | Migrate after MVP | 1-2 weeks |
| Compliance mandate | Migrate within 30 days | 1-2 weeks |
| Feature requirement | Evaluate feature availability | 1-3 weeks |
| Performance issue | Investigate before migrating | Varies |

---

## 7. Monitoring & Compliance

### Vendor Metrics to Track

**Database**:
- Query latency (p95, p99)
- Connection pool usage
- Storage size growth
- Backup/restore time

**Authentication**:
- Login success rate
- Token generation latency
- OAuth provider availability
- Session duration

**Hosting**:
- Response time (API p95, p99)
- Uptime percentage
- Build time
- Deployment frequency

### Anti-Lock-in Checklist

- [ ] All repositories implement `RepositoryPort` interface
- [ ] All external integrations implement port interfaces
- [ ] Environment variables configured for all vendors
- [ ] Tests use in-memory implementations or Docker containers
- [ ] Documentation updated on vendor change
- [ ] Build system is vendor-agnostic
- [ ] Database schema is ORM-agnostic
- [ ] No vendor-specific code in domain layer

---

## 8. References

**Related Tasks**:
- IFC-011: Framework/SDLC Definition
- IFC-057: Vendor Lock-in Mitigation (this document)
- ENV-004-AI: Supabase Integration
- EXC-SEC-001: HashiCorp Vault Setup

**Key Documents**:
- Hexagonal Architecture: `docs/architecture/adr/001-hexagonal-architecture.md`
- Domain Driven Design Context Map: `docs/shared/context-map.puml`
- Artifact Conventions: `docs/architecture/artifact-conventions.md`

---

## 9. Next Steps

1. **Phase 1** (Sprint 7-8): Implement alternative repository adapters (TypeORM)
2. **Phase 2** (Sprint 9-10): Implement alternative auth adapters (Auth0)
3. **Phase 3** (Sprint 11-12): Document alternative hosting deployment
4. **Phase 4** (Sprint 13+): Run full migration test against alternative stack

---

**Approval**: IFC-057 completion verified with vendor lock-in risk eliminated through documented abstraction layers.
