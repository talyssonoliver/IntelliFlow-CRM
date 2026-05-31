# packages/sdk - External TypeScript SDK

## Purpose

`@intelliflow/sdk` is the **official, publishable** TypeScript SDK for the
IntelliFlow CRM — fully-typed tRPC clients with zero codegen (types flow from
the backend). Built with tsup to `dist/` (ESM + CJS + d.ts); has
`prepublishOnly`.

## Not dead code — consumers are EXTERNAL by design

- It is the **only** non-`private` package here, intended for **downstream /
  external** consumers (published artifact), not internal workspace imports.
- So "no internal importers" is **expected**, not a defect. Do not treat it like
  the orphaned internal packages — it is wired by _publication_, not by a
  workspace dependency. (`package-review` marks it `LOW` only because it has no
  internal callers.)

## Entry Points

- `src/index.ts` → built to `dist/index.{js,mjs,d.ts}` (the `.` export).
- `src/api-client.d.ts` — typed tRPC client surface.

## Pitfalls

- Public API: breaking changes here affect external users — version with care.
- Build before publish/test downstream (`pnpm --filter @intelliflow/sdk build`);
  consumers resolve `dist/`, not `src/`.
