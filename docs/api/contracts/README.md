# API Contracts - LLM-Friendly Reference

> **Source of Truth**: `api-contracts.yaml`
> **Validator**: `packages/validators/__tests__/api-contract-consistency.spec.ts`
> **Last Updated**: 2026-01-05
> **Tokens**: ~800 (optimized for LLM context)

## Quick Reference

### Procedure Types

| Procedure | Auth | Tenant | Owner Filter | Use Case |
|-----------|------|--------|--------------|----------|
| `publicProcedure` | No | No | No | Health, login |
| `protectedProcedure` | Yes | Yes | No | Analytics, admin |
| `tenantProcedure` | Yes | Yes | By role | CRM entities |
| `adminProcedure` | Yes | Yes | No | Admin only |

### Role-Based Filtering (tenantProcedure)

| Role | Data Scope |
|------|------------|
| ADMIN | All tenant records |
| MANAGER | Team records |
| SALES_REP | Own records only |
| USER | Own records only |

---

## Router Summary (19 routers, 170 endpoints)

### CRM Core

| Router | Procedure | Owner Filter | Endpoints |
|--------|-----------|--------------|-----------|
| lead | tenantProcedure | Yes | create, getById, list, update, delete, qualify, convert, scoreWithAI, **stats**, getHotLeads, bulkScore, bulkConvert, bulkUpdateStatus, bulkArchive, bulkDelete |
| contact | tenantProcedure | Yes | create, getById, getByEmail, list, update, delete, linkToAccount, unlinkFromAccount, **stats**, search, changeStatus, bulkEmail, bulkExport, bulkDelete |
| account | tenantProcedure | Yes | create, getById, list, update, delete, **stats** |
| opportunity | tenantProcedure | Yes | create, getById, list, update, delete, **stats**, forecast |

### CRM Support

| Router | Procedure | Owner Filter | Endpoints |
|--------|-----------|--------------|-----------|
| task | tenantProcedure | Yes | create, getById, list, update, delete, complete, **stats** |
| ticket | tenantProcedure | No | create, getById, list, update, delete, **stats**, addResponse, bulkAssign, bulkUpdateStatus, bulkResolve, bulkEscalate, bulkClose |

### Analytics & AI

| Router | Procedure | Owner Filter | Endpoints |
|--------|-----------|--------------|-----------|
| analytics | protectedProcedure | No | dealsWonTrend, growthTrends, trafficSources, recentActivity, leadStats |
| agent | protectedProcedure | No | listTools, getTool, executeTool, getPendingApprovals, approveAction, rejectAction |
| conversation | protectedProcedure | No | create, getById, search, addMessage, recordToolCall, updateToolCall, endConversation, getAnalytics (admin) |
| feedback | tenantProcedure | Yes | submitSimple, submitCorrection, getForLead; protectedProcedure for getAnalytics |

### Legal

| Router | Procedure | Owner Filter | Endpoints |
|--------|-----------|--------------|-----------|
| appointments | protectedProcedure | No | create, list, update, reschedule, confirm, complete, cancel, checkConflicts, findNextSlot, **stats** |
| documents | protectedProcedure | No (ACL-based) | create, createVersion, getById, list, grantAccess, revokeAccess, sign, archive, placeLegalHold |

### Infrastructure

| Router | Procedure | Owner Filter | Endpoints |
|--------|-----------|--------------|-----------|
| health | publicProcedure | No | ping, check, ready, alive, dbStats |
| auth | publicProcedure | No | login, loginWithOAuth, logout (protected), setupMfa (protected), getSessions (protected) |
| billing | protectedProcedure | No | getSubscription, listInvoices, updatePaymentMethod, updateSubscription, cancelSubscription |
| timeline | tenantProcedure | Yes | list |
| system | publicProcedure | No | version, info, features, **config** (admin), **metrics** (admin), capabilities |
| upload | protectedProcedure | No | upload, getUploadStatus |
| cases | tenantProcedure | N/A | *STUB - pending Prisma schema* |

---

## Consistency Rules

### Rule 1: Stats Must Match List Scope

```
IF router.list.ownerFilter === true
THEN router.stats.ownerFilter MUST === true
```

**Affected**: lead, contact, account, opportunity, task, ticket

### Rule 2: CRUD Procedure Consistency

```
create, getById, list, update, delete
MUST use same procedure type within a router
```

### Rule 3: Owner Filter Consistency

```
All CRM entity endpoints in same router
MUST have same ownerFilter value
```

---

## Known Violations

*No known violations* - All issues have been resolved.

---

## Resolved Violations (History)

| ID | Router | Endpoint | Issue | Resolved |
|----|--------|----------|-------|----------|
| VIOLATION-001 | lead | stats | Was using `protectedProcedure` instead of `tenantProcedure` | 2026-01-05 |
| VIOLATION-002 | documents | create, list | Was using `userId` as `tenantId` | 2026-01-05 |

**VIOLATION-001 Resolution**: Changed `lead.stats` to use `tenantProcedure` with `createTenantWhereClause()`. Dashboard and Leads page now show consistent data.

**VIOLATION-002 Resolution**: Changed `documents.router.ts` to use `ctx.user?.tenantId` instead of `userId`. Fixed multi-tenant isolation for document storage.

---

## Validation Commands

```bash
# Run contract validation
pnpm --filter @intelliflow/validators test api-contract-consistency

# Check specific router
pnpm --filter @intelliflow/validators test api-contract-consistency -- --grep "lead"
```

---

## Adding New Endpoints

1. **Update Contract**: Add endpoint to `api-contracts.yaml`
2. **Implement Code**: Match procedure and ownerFilter from contract
3. **Run Validation**: `pnpm test api-contract-consistency`
4. **CI Enforcement**: Tests run on every PR

---

## File Locations

| File | Purpose |
|------|---------|
| `docs/api/contracts/api-contracts.yaml` | Source of truth |
| `docs/api/contracts/README.md` | This file (LLM reference) |
| `packages/validators/__tests__/api-contract-consistency.spec.ts` | Validator tests |
| `apps/api/src/modules/*/` | Router implementations |
