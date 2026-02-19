# packages/application — Application Layer (Use Cases & Ports)

## Purpose

Orchestrates domain logic via use cases. Defines **ports** (interfaces) that adapters implement. This layer sits between domain and infrastructure in the hexagonal architecture.

## Structure

```
src/
├── ports/           # Interface definitions (implemented by adapters)
├── usecases/        # Application use cases orchestrating domain logic
├── services/        # Application services (thin orchestration)
├── errors/          # Application-level error types
└── index.ts         # Barrel exports
```

## Key Rules

1. **Depends on**: `packages/domain/` only — NEVER import from adapters or apps
2. **No infrastructure**: No Prisma, no HTTP, no file system access
3. **Ports are interfaces**: Define what the application needs; adapters provide implementations
4. **Use cases coordinate**: They call domain entities/services and ports, but contain no business logic themselves
5. **Coverage target**: >90% (CI enforced)

## Port Pattern

```typescript
// ports/LeadRepository.ts — defines what the app needs
export interface LeadRepository {
  save(lead: Lead): Promise<void>;
  findById(id: LeadId): Promise<Lead | null>;
}

// Implemented by PrismaLeadRepository in packages/adapters/
```

## Testing

- Test use cases with mocked ports (repositories, external services)
- Use `vi.fn()` for port mocks with `Record<string, any>` type to avoid TS2348
- Focus on orchestration logic and error handling paths
- `pnpm --filter @intelliflow/application test`

## Building

- `pnpm --filter @intelliflow/application build`
- Uses tsup for bundling with DTS generation
- After adding/changing exports in `src/index.ts`, rebuild to update dist
