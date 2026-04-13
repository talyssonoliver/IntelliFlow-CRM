# apps/api ÔÇö tRPC API Server

## Structure

```
src/modules/<entity>/
  <entity>.router.ts      # tRPC router (public API)
  <entity>.service.ts      # Business logic orchestration
  __tests__/               # Co-located tests
```

## Key Patterns

- **Router ÔåÆ Service ÔåÆ Adapter**: Routers call services, services use
  ports/adapters
- End-to-end type safety via tRPC ÔÇö frontend auto-gets typed client
- Context recreated per request ÔÇö don't store mutable state
- All inputs validated with Zod schemas from `@intelliflow/validators`

## Container Wiring (CRITICAL)

**ALWAYS verify `container.ts` + `context.ts` wiring for backend/API tasks.**
Static checks (typecheck, mocked tests, lint, build) can all pass while a
service is never actually instantiated.

Root cause: IFC-086 attestation falsely claimed "service wired in container" ÔÇö
4 broken services discovered (ChainVersion, Experiment, Feedback,
ConversationSearch).

When adding a new service:

1. Create the class in appropriate package
2. **Register it in `container.ts`** ÔÇö this is where DI happens
3. Wire it in `context.ts` if it needs request context
4. Verify with a runtime check, not just typecheck

## DTS Resolution

If you get TS2305 "has no exported member" from `@intelliflow/adapters` or
`@intelliflow/application`:

- **ROOT CAUSE**: `src/types/intelliflow-adapters.d.ts` and
  `intelliflow-application.d.ts` contained `declare module` stubs that OVERRODE
  actual package resolution. These stubs only listed ~9 exports each, masking
  all others.
- **FIX**: Delete the stub `.d.ts` file ÔÇö don't modify DTS generation or blame
  TS version
- **NOT a TS version bug**: Same issue on both TS 5.8.3 and 5.9.3, with tsup
  --dts, --experimental-dts, and tsc --emitDeclarationOnly
- **Lesson**: ALWAYS check `src/types/` for `declare module` overrides BEFORE
  blaming DTS generation
- For test files using `await import(...)`, use `as any` cast on the result
