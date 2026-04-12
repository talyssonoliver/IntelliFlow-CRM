# Common Gotchas

1. **Prisma Client Generation**: Always run `pnpm run db:generate` after schema
   changes. See `packages/db/CLAUDE.md` for Prisma-specific issues.

2. **tRPC Context**: Context is recreated per request — don't store mutable
   state.

3. **Next.js Caching**: Be careful with fetch caching in Server Components.

4. **Zod Transforms**: Use `.transform()` carefully — can break type inference.

5. **Domain Events**: Always publish events AFTER transaction commits.

6. **AI Timeouts**: LLM calls can be slow — always set appropriate timeouts.
   Target: AI scoring <2s, predictions <2s.

7. **Monorepo Imports**: Use workspace protocol in package.json:
   `"@intelliflow/domain": "workspace:*"`

8. **Sprint Plan KPIs**: All tasks have specific KPIs in Sprint_plan.csv. CI/CD
   should validate where possible.

9. **Artifact Paths**: Follow conventions from IFC-160. Paths are linted in CI.
   Wrong paths cause failures. Track relocations in
   `scripts/migration/artifact-move-map.csv`.

10. **Sprint Plan Location**: NEVER move Sprint_plan files without updating API
    routes.
    - Sprint_plan.json/csv: `apps/project-tracker/docs/metrics/_global/`
    - Referenced by: `apps/project-tracker/app/api/sprint-plan/route.ts`

11. **Metrics Infrastructure**: Structured JSON tracking prevents fabrication.
    Task files must include SHA256 hashes, ISO timestamps, validation results.
    Schemas enforce: `task-status.schema.json`, `phase-summary.schema.json`,
    `sprint-summary.schema.json`.

12. **Hexagonal Architecture**: Domain layer CANNOT depend on infrastructure.
    Enforced by architecture tests in `packages/architecture-tests/`. Violations
    fail CI.

13. **Test Coverage**: Different layers have different requirements —
    Domain >95%, Application >90%, Overall >90% (CI enforced).

14. **Performance Budgets**: API responses p95 <100ms, p99 <200ms. Frontend
    Lighthouse >90, FCP <1s. DB queries <20ms. Full build <3 minutes.

## Testing-Specific Gotchas

- Use `pnpm typecheck` (turborepo) instead of `npx tsc --noEmit` — root tsc
  includes ~22K errors from wide tsconfig scope
- Test mocks for Prisma need `as any` cast when including relation objects
- Under `module: "Node16"`, `await import('../file')` needs `.js` extension
- Use `Record<string, any>` for mock repositories to avoid TS2348 "not callable"
  on vi.fn()
- **Stale `SESSION_CONTEXT.md`** — regenerate after any `Sprint_plan.csv` edit
  or task status change
  (`npx tsx apps/project-tracker/scripts/generate-context.ts` or `/refresh-context`)
