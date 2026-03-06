# apps/web — Next.js Frontend

## Stack

- **Next.js 16.0.10** (App Router)
- **shadcn/ui** components from `packages/ui/`
- **Tailwind CSS** for styling
- **Vitest** for unit tests, **Playwright** for E2E

## Key Patterns

- Pages in `src/app/` follow Next.js App Router conventions
- Shared components in `src/components/`
- Hooks in `src/hooks/` and `src/lib/*/hooks/`
- tRPC client auto-typed from API — use `trpc.<router>.<procedure>` pattern

## Performance Targets

- Lighthouse scores >= 90 (all categories) on production build
- First Contentful Paint < 1s
- Core Web Vitals: LCP <2.5s, CLS <0.1, TBT <300ms
- Resource budgets: JS <300KB, CSS <50KB, Total <1MB
- Server response < 200ms

## Lighthouse CI

- Config: `lighthouserc.js` at project root — 27 URLs, desktop preset
- Commands: `pnpm run lighthouse` (autorun), `pnpm run lighthouse:ci`
  (filesystem to `artifacts/lighthouse/`)
- Quick:
  `npx lhci autorun --collect.url=http://localhost:3000/<path> --collect.numberOfRuns=1`
- **Dev server scores ~60% performance** (unminified JS, no gzip, HMR) — use
  production build for real benchmarks

## Critical Rules

- **NEVER skip `build` validation** — "Next.js compiles on demand" is NOT a
  valid excuse. Build catches import errors, missing deps, SSR issues that dev
  mode misses.
- **ALL 4 validations are NON-NEGOTIABLE**: TypeScript, Tests, Lint, Build
- Coverage must be **scoped and measured**:
  `npx vitest run <test-dir> --coverage --coverage.include='<src-pattern>'`
- Coverage thresholds: Statements >=90%, Branches >=80%, Functions >=90%,
  Lines >=90%
- **Test count is NOT a proxy for coverage** — always run actual scoped Istanbul
  coverage

## UI Tasks

All PG-\* tasks MUST reference design mockups via `DESIGN:` prefix in
Sprint_plan.csv. See `docs/design/README.md` for mockup locations and component
checklists.
