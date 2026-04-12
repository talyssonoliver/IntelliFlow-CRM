# Audit Rubric

## Core Areas

| Area                             | Why It Matters                  | Typical AI Failure                                   | What to Audit                                                                 |
| -------------------------------- | ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Logical correctness              | Prevents silent bugs            | Invented fields, wrong rules, unreachable fixes      | Data shapes, business rules, edge cases, runtime caller alignment             |
| Type safety                      | Prevents runtime errors         | `as unknown as`, `any`, fake generic safety          | Real types, schema alignment, inference, nullable handling                    |
| Security and data handling       | Protects sensitive data         | Missing validation, auth bypass, leaking internals   | Zod schemas, auth and tenant checks, sanitization, serialization, errors      |
| Architecture and maintainability | Keeps the codebase coherent     | Wrong pattern copy, naming drift, boundary erosion   | Module boundaries, DDD placement, container wiring, duplication, test quality |
| Performance and resource use     | Keeps UX and infra costs stable | Over-fetching, rerenders, serial work, broad queries | Query shape, caching, render behavior, loops, allocations, payload size       |

## 1. Logical Correctness

Look for:

- Behavior that contradicts the spec's acceptance criteria or invariants
- New branches with no negative-path handling
- Partial implementations where helper code changed but the runtime caller did
  not
- Legacy paths that still bypass the new behavior
- Assumptions about ordering, uniqueness, nullability, or enum coverage that are
  not guaranteed by the actual types or schema

Common failure patterns:

- Code reads or writes fields that do not exist in the validator, DTO, Prisma
  model, or domain entity
- Filtering logic silently widens or narrows behavior compared with the task
  requirement
- Pagination, offset, sort, or status filters interact incorrectly with the new
  feature
- Empty string, zero, null, undefined, and empty-array cases are conflated

## 2. Type Safety

Look for:

- `any`, `unknown`, double-casts, non-null assertions, and overly broad index
  access
- Mocks or tests that coerce invalid shapes into typed APIs
- Functions that claim stricter return types than the code guarantees
- Schema changes that were not propagated to callers

Common failure patterns:

- `as unknown as` used to bypass router, service, or context contracts
- `as never` around tRPC hooks or inputs instead of fixing the real type
  mismatch
- Generic helpers that erase discriminants or lose optional-field safety
- Runtime checks missing where TypeScript cannot actually prove safety

## 3. Security And Data Handling

Look for:

- Missing validation at API, action, or form boundaries
- Tenant or auth checks that happen in one path but not another
- Unsafe trust of client-provided IDs, roles, or status values
- Error messages or logs that expose secrets, internals, or PII
- Serialization and parsing done without validation

Repo-specific checks:

- If Prisma data is tenant-scoped, verify the query path does not drop the
  tenant constraint.
- If the task touches API services, verify new services are actually wired
  through the intended container/context path.
- If the task touches displayed data, verify it comes from real sources rather
  than invented placeholder values.

## 4. Architecture And Maintainability

Look for:

- Domain logic leaking into infrastructure or presentation layers
- Infrastructure dependencies creeping into `packages/domain`
- API code that adds a service or repository but never wires it into the real
  container path
- Naming or folder placement that breaks existing patterns
- New duplication instead of extending an existing pattern
- Tests that assert mocks or implementation details instead of behavior

Repo-specific checks:

- Preserve hexagonal and DDD boundaries.
- Treat `packages/domain` as zero-infra.
- When backend wiring changes, verify `container.ts` and runtime context follow
  the existing pattern.
- For frontend tasks, verify the code follows existing Next.js and shared-UI
  conventions rather than inventing a parallel pattern.

## 5. Performance And Resource Use

Look for:

- Prisma or database queries that fetch more fields or rows than the feature
  needs
- Repeated work inside loops or repeated renders
- Serial awaits that should be parallel
- Missing cache usage where the task relies on repeated expensive reads
- Payload transformations or large object copies on hot paths
- Search or filtering logic that scales poorly relative to the claimed dataset

Common failure patterns:

- Count and list queries drift apart and return inconsistent totals
- New filters break index usage or force broad scans without a strong reason
- Client code triggers refetch or rerender loops through unstable params
- Expensive derived state recalculates on every render without need

## 6. Maintainability Signals Worth Calling Out

Raise at least a medium-severity finding when the task leaves behind:

- Hidden coupling that makes future changes unsafe
- Dead or unreachable code presented as part of the solution
- TODO-style placeholders in production paths
- Duplicate validation or mapping logic that will drift
- Tests that would not fail if the shipped behavior regressed
