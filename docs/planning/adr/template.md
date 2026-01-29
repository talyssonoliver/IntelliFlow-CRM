# ADR-XXX: [Title of Decision]

**Status:** [Proposed | Accepted | Rejected | Deprecated | Superseded by
ADR-YYY]

**Date:** YYYY-MM-DD

**Deciders:** [List of people involved in the decision]

**Technical Story:** [Link to relevant task/issue, e.g., IFC-001]

## Context and Problem Statement

[Describe the context and problem statement, e.g., in 2-3 sentences. You may
want to articulate the problem in the form of a question.]

## Decision Drivers

- [driver 1, e.g., a force, facing concern, requirement]
- [driver 2, e.g., a force, facing concern, requirement]
- [driver 3, e.g., a force, facing concern, requirement]
- ... <!-- numbers of drivers can vary -->

## Considered Options

- [option 1]
- [option 2]
- [option 3]
- ... <!-- numbers of options can vary -->

## Decision Outcome

Chosen option: "[option 1]", because [justification. e.g., only option that
meets k.o. criterion decision driver | which resolves force force | ... | comes
out best (see below)].

### Positive Consequences <!-- optional -->

- [e.g., improvement of quality attribute satisfaction, follow-up decisions
  required, ...]
- ...

### Negative Consequences <!-- optional -->

- [e.g., compromising quality attribute, follow-up decisions required, ...]
- ...

## Pros and Cons of the Options <!-- optional -->

### [option 1]

[example | description | pointer to more information | ...]

- Good, because [argument a]
- Good, because [argument b]
- Bad, because [argument c]
- ... <!-- numbers of pros and cons can vary -->

### [option 2]

[example | description | pointer to more information | ...]

- Good, because [argument a]
- Good, because [argument b]
- Bad, because [argument c]
- ... <!-- numbers of pros and cons can vary -->

### [option 3]

[example | description | pointer to more information | ...]

- Good, because [argument a]
- Good, because [argument b]
- Bad, because [argument c]
- ... <!-- numbers of pros and cons can vary -->

## Links <!-- optional -->

- [Link type] [Link to ADR]
  <!-- example: Refines [ADR-0005](0005-example.md) -->
- [Related documentation]
- [Sprint plan task reference]

## Implementation Notes <!-- optional -->

[Any specific notes about implementing this decision]

### Validation Criteria

- [ ] Criterion 1 met
- [ ] Criterion 2 met
- [ ] Tests written
- [ ] Documentation updated

### Rollback Plan

[Describe how to rollback this decision if needed]

---

## Example ADR

# ADR-001: Use tRPC for API Layer

**Status:** Accepted

**Date:** 2025-12-14

**Deciders:** Architecture Team, Backend Team

**Technical Story:** IFC-003, IFC-007

## Context and Problem Statement

IntelliFlow CRM requires a robust API layer that connects the Next.js frontend
with the backend services. We need to decide on the API architecture that
provides type safety, good developer experience, and scalability. How should we
build our API layer to maximize productivity and minimize bugs?

## Decision Drivers

- End-to-end type safety from backend to frontend
- Excellent developer experience with autocomplete and type checking
- Minimal runtime overhead
- Easy to test and maintain
- Works well in a monorepo setup
- Good ecosystem and community support

## Considered Options

- **Option 1**: tRPC - TypeScript RPC framework
- **Option 2**: GraphQL with Pothos/GraphQL Codegen
- **Option 3**: REST API with OpenAPI/Swagger
- **Option 4**: gRPC with protobuf

## Decision Outcome

Chosen option: "tRPC", because it provides end-to-end type safety without code
generation, has excellent DX, minimal overhead, and works perfectly in our
TypeScript monorepo setup.

### Positive Consequences

- Full type safety from database to frontend without code generation
- Automatic client generation with perfect TypeScript types
- Excellent autocomplete and IntelliSense in IDE
- Smaller bundle size compared to GraphQL
- Built-in support for subscriptions via WebSockets
- Easy to test with type-safe mocking
- Perfect for monorepo architecture
- Active community and good documentation

### Negative Consequences

- TypeScript-only (not suitable for non-TS clients)
- Smaller ecosystem compared to REST or GraphQL
- Less suitable for public APIs (better for internal use)
- Requires sharing types between client and server

## Pros and Cons of the Options

### tRPC

- Good, because it provides end-to-end type safety without code generation
- Good, because it has minimal runtime overhead
- Good, because it works perfectly in monorepos with shared types
- Good, because it has excellent developer experience
- Good, because it's lightweight and fast
- Bad, because it's TypeScript-only
- Bad, because it has a smaller ecosystem than REST/GraphQL
- Bad, because it's less suitable for public-facing APIs

### GraphQL with Pothos

- Good, because it's well-established and has a large ecosystem
- Good, because it supports multiple client languages
- Good, because it has powerful query capabilities
- Good, because Pothos provides code-first schema with type safety
- Bad, because it requires code generation for full type safety
- Bad, because it has higher runtime overhead
- Bad, because it's more complex to set up and maintain
- Bad, because it has larger bundle sizes

### REST API with OpenAPI

- Good, because it's the most established pattern
- Good, because it supports any client language
- Good, because it has the largest ecosystem
- Good, because it's well-understood by all developers
- Bad, because it lacks compile-time type safety
- Bad, because it requires separate code generation
- Bad, because OpenAPI specs can drift from implementation
- Bad, because it requires more boilerplate

### gRPC

- Good, because it's very performant
- Good, because it has strong typing with protobuf
- Good, because it supports multiple languages
- Bad, because it requires protobuf compilation
- Bad, because it's less suitable for browser clients
- Bad, because it's more complex to set up
- Bad, because it has poor browser support without proxies

## Links

- [tRPC Documentation](https://trpc.io)
- [Technical Spike: IFC-001](../../Sprint_plan.csv)
- [API Setup Task: IFC-007](../../Sprint_plan.csv)
- [API Routes Documentation](../../api/trpc-routes.md)

## Implementation Notes

### Setup Requirements

1. Install tRPC packages:

   ```bash
   pnpm add @trpc/server @trpc/client @trpc/react-query @trpc/next
   ```

2. Create router in `apps/api/src/router/`
3. Set up tRPC context with authentication
4. Configure Next.js API routes
5. Generate client hooks for React Query

### Validation Criteria

- [x] tRPC server running on port 4000
- [x] Type safety verified (TypeScript errors on client for server changes)
- [x] Authentication middleware working
- [x] Error handling implemented
- [x] Tests written for all routers
- [x] Documentation updated

### Rollback Plan

If tRPC doesn't meet our needs:

1. Keep existing routers as reference
2. Implement REST API with Zod validation
3. Use OpenAPI for documentation
4. Generate TypeScript client with openapi-typescript

---

**Note**: This is a template. Copy this file and customize it for your specific
architectural decision.
