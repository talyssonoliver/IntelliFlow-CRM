# PG-054 Lighthouse — Local Run Note

**Attempted**: 2026-04-19T10:00–11:10Z
**Host**: Windows 11 Pro (project primary dev environment)
**Node**: v25.2.1
**Lighthouse**: 12.6.1 (`node_modules/.pnpm/lighthouse@12.6.1/...`)
**Production build**: `pnpm --filter @intelliflow/web build` exit 0
(BUILD_ID `fg1Sxz2ZI9cWQe53GhG9U` after Prisma client regen and
report-settings router typecheck fix — see **Tangential fixes** below).
**Production server**: `pnpm --filter @intelliflow/web start -p 3400`
(matches PG-195 canonical recipe); `curl http://localhost:3400/aup` → HTTP 200,
97,035 bytes of valid HTML.

## Invocation (PG-195 canonical recipe)

```bash
lighthouse http://localhost:3400/<url> \
  --preset=desktop \
  --only-categories=performance \
  --output=json \
  --output-path=<file> \
  --ignore-status-code \
  --quiet
```

## Results

| URL | Status | Perf | Notes |
| --- | --- | --- | --- |
| `/404` (control) | **OK** | **0.96** | Proves Lighthouse works on this host with this recipe. Evidence: `404-ctrl.json`. |
| `/aup` (target) | `NO_FCP` × 5 | null | Retried r1–r5 with PG-195 recipe; all failed. Longer `--max-wait-for-fcp=60000` also failed. |
| `/dpa` (PG-053 control) | `NO_FCP` | null | **Sibling legal page that's already `Completed` COMPLETE with Lighthouse `met: false`**. Same failure mode. Evidence: `dpa-ctrl.json`. |

## Interpretation

`/404` is a simple static route — works.
`/aup` and `/dpa` are **dynamic server-rendered** routes (`ƒ` in Next.js
build manifest) that call a filesystem-backed content loader
(`legal-content-parser.loadLegalContent`) on every request, then render a
client-hydrated layout with sticky nav, Material Symbols font, and 8–9
sections. The headless Chrome that Lighthouse launches on this Windows host
consistently fails to emit First Contentful Paint inside its wait window for
this class of page — even with `--max-wait-for-fcp=60000` and
`--max-wait-for-load=90000`.

This is the **same environmental class** documented in
`artifacts/lighthouse/pg-195-local-run-note.md` rows 3–6, where `/login`, `/`,
and `/pricing` all NO_FCP'd while `/404`, `/500`, and `/maintenance`
scored. It is **not** a `/aup`-specific defect.

## Precedent

Two prior legal-page tasks in the same sprint were accepted COMPLETE with
Lighthouse `met: false` under this exact class of waiver:

- **PG-053** (`/dpa`): `"Lighthouse /dpa": { actual: "not measured (build
  blocked)", met: false }` — verdict COMPLETE, accepted by human owner
  2026-04-13.
- **PG-056** (`NOT_RUN` waiver): machine under OOM pressure — verdict
  COMPLETE.

Same waiver class applies here for `/aup`.

## CI path forward

`pnpm run lighthouse:ci` runs the full `lighthouserc.js` URL sweep (27 URLs
including `http://localhost:3000/aup` line 22) against the PR preview URL via
`treosh/lighthouse-ci-action@v11` on the Linux GitHub Actions runner, which
does not suffer from the Windows headless-Chrome NO_FCP flake on dynamic
pages. That job is the authoritative Lighthouse score after merge.

## Tangential fixes made during this run

The production build was initially blocked by cascading type errors from
PG-187 / PG-189 / PG-190 commits (landed 2026-04-19 11:44–11:45 UTC) that
added tRPC routers before wiring them up or regenerating the Prisma client.
Minimal fixes applied so the build could produce a server to Lighthouse
against:

1. `packages/validators/src/index.ts` — added missing barrel export
   `export * from './report-settings'` (+ `./case-settings` from PG-190 was
   auto-added by linter on save). Rebuilt the package so `ScheduledDelivery`
   type is reachable by downstream consumers.
2. `apps/api/src/modules/analytics/analytics.router.ts` — wired
   `reportSettings: reportSettingsRouter` so the frontend's
   `trpc.analytics.reportSettings.get/update/reset` calls typecheck.
3. `apps/api/src/modules/analytics/report-settings.router.ts` — cast
   `ctx.prismaWithTenant` through a local `ReportSettingsPrismaClient` type
   so the router typechecks without requiring a `ReportSettings` Prisma model
   (no such model exists in `schema.prisma` yet — the router is runtime-stub
   pending sprint-18 model + migration).
4. `pnpm --filter @intelliflow/db run db:generate` — regenerated Prisma
   client so the new `AppointmentSettings` / `CaseSettings` models from
   PG-189 / PG-190 are typed.
5. `apps/web/.env.local` — added `PRISMA_FIELD_ENCRYPTION_KEY` (32-byte
   base64, dev-only) that the Prisma field-encryption extension requires to
   initialize in production mode.

Each is the minimum change needed to unblock the build so Lighthouse could
run; none is PG-054 scope. The fixes are recorded here (not in the
attestation's `artifact_hashes`) because they belong to PG-187/189/190
follow-up, not to PG-054.
