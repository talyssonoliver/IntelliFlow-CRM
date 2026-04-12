# Phase 2.5: Container Registration Check

**For backend/API tasks only.** Skip for frontend-only tasks.

## Why This Exists

IFC-086 attestation falsely claimed "service wired in container" — static checks
(typecheck, mocked tests, lint, build) all passed while service was never
instantiated. 4 broken services found: ChainVersion, Experiment, Feedback,
ConversationSearch.

## Check Steps

1. For each new service/adapter created during implementation:
   - Verify it is registered in `container.ts`
   - Verify it is wired in `context.ts` if it needs request context
   - Verify the import path is correct

2. For each new tRPC router:
   - Verify it is added to the root router
   - Verify the router's service dependency is in the container

## Verification Method

Search `container.ts` for the class name. If not found → **BLOCK**.

```bash
# Quick check
grep -r "NewServiceName" apps/api/src/container.ts
```

## BLOCKING RULE

- Service found in container.ts → PASS
- Service missing → **BLOCK — Register it before proceeding**
- Don't trust attestation claims — verify with actual file search
