# ADR-046: Material Symbols Font Subsetting Strategy

**Status:** Proposed

**Date:** 2026-04-13

**Deciders:** Growth FE (STOA-Foundation), Performance WG

**Technical Story:** PG-195 (font-weight optimization), blocks Lighthouse
Performance ≥90 gate on `/404` and `/500` (see PG-056 baseline
`artifacts/lighthouse/pg-056-500-r1.json` — Performance = 0.63).

## Context and Problem Statement

`apps/web/public/fonts/MaterialSymbolsOutlined.woff2` is 3,555,400 bytes
(≈3.39 MB transfer). It is loaded by the root layout
(`apps/web/src/app/layout.tsx:14-19`) and applied via `className={...
materialSymbols.variable ...}` on `<body>` (line 81), so every route — public
(/404, /500) and authenticated — ships the full variable font containing
~3,500 glyphs across the variable axes `wght 100..700`, `FILL 0/1`,
`GRAD -25..200`, `opsz 20..48`.

The production CSS only pins a single static point — `FILL 0`, `wght 400`,
`GRAD 0`, `opsz 24` (`apps/web/src/app/globals.css:255-259`) — and uses at most
~200 unique icon ligatures across ~1,559 call-site hits in production code
(excluding docs mockups and e2e tests).

Result: Lighthouse Performance on `/500` is 0.63, driven by a 3.56 MB font that
accounts for 89% of total transfer (3.99 MB). How should we subset the font so
that we ship only the glyphs we use, at the single weight we use, while
remaining reproducible and safe against silent regressions?

## Decision Drivers

- Lighthouse Performance ≥90 on production build (non-negotiable, see
  `docs/claude-refs/nonfunctional.md:11`).
- Resource Budget: Total <1 MB (non-negotiable, see
  `apps/web/CLAUDE.md` Resource Budgets, `nonfunctional.md:13`).
- Zero visual regression across 1,559 production icon call sites; missing
  glyphs render as tofu (`□`).
- Reproducibility: subsetted font must be reproducible from committed source
  (script + input font URL + glyph audit) without a human copy-paste step.
- Cross-platform: the build must work on Windows developer machines (project
  primary environment) and Linux CI — no Python runtime assumption.
- Detectability of drift: a new icon name added in source must either be
  auto-included by the subsetter next run, or surface a hard CI failure — never
  ship as a silent tofu in production.
- Material Symbols uses OpenType ligatures (`liga` in GSUB) — `arrow_back` as
  text becomes one glyph. The subsetter must preserve the GSUB tables needed
  for those ligatures.

## Considered Options

- **Option 1**: `subset-font` npm package (WASM HarfBuzz) invoked from a
  Node.js tsx/mjs script in `tools/scripts/`, operating on the committed
  upstream woff2.
- **Option 2**: `pyftsubset` from `fonttools` invoked via shell. Requires
  Python runtime on CI and dev boxes.
- **Option 3**: Switch to the hosted Google Fonts CSS API (`fonts.googleapis.com`)
  with `?icon_names=…&display=swap` query string. Google serves the subsetted
  font over their CDN.
- **Option 4**: Replace the font with per-icon React SVG components (e.g.
  `lucide-react`), removing Material Symbols entirely.

## Decision Outcome

Chosen option: **Option 1 — `subset-font` npm package, Node-driven
subsetter + committed glyph-audit JSON + CI `--verify` guard.**

It is the only option that (a) removes the Python dependency, (b) keeps the
font self-hosted (a hard CSP and offline-dev requirement inherited from
`next/font/local` in `apps/web/src/app/layout.tsx:14`), (c) is fully
reproducible from committed inputs, and (d) can be wired to a CI guard that
fails builds when a new icon name is referenced but not yet in the audit.

### Positive Consequences

- Expected font transfer drops from 3,473 KB to <500 KB — ~86% smaller.
- Lighthouse Performance on `/404` and `/500` crosses the ≥90 gate.
- Total page byte-weight on `/500` drops below the 1 MB resource budget.
- Dropping variable axes (keeping only `wght=400` static instance) yields
  additional savings vs naïve codepoint subset alone.
- CI guard (`node tools/scripts/subset-material-symbols.mjs --verify`) blocks
  PRs that introduce a new icon without regenerating the audit, eliminating
  silent tofu regressions.
- Self-hosted via `next/font/local` — preserves existing CSP, offline
  reproducibility, and zero third-party font CDN dependency.

### Negative Consequences

- Introduces one new dev-dependency (`subset-font`) to the root workspace.
- Adds a pre-Lighthouse/pre-build manual step (or CI step) when a new icon is
  added: author must run `node tools/scripts/subset-material-symbols.mjs` to
  regenerate the font + audit JSON, then commit the updated woff2 and JSON.
- A dynamic icon name produced from non-literal runtime data (e.g. server
  response) would not be detectable by the static scan; we rely on a
  convention that all dynamic call sites resolve to a bounded set of string
  literals visible to a source scan, and the audit lists the resolved set.

## Pros and Cons of the Options

### Option 1 — `subset-font` (HarfBuzz WASM, Node)

- Good, because it is pure npm and runs on Windows + Linux with no Python
  runtime.
- Good, because it supports woff2 input/output and preserves GSUB ligature
  tables needed for Material Symbols.
- Good, because it supports static-instancing of variable axes, letting us
  drop `FILL`, `GRAD`, `opsz` axes and pin `wght=400`, which yields the
  largest savings.
- Good, because the subsetter runs in the same Node toolchain as the rest of
  `tools/scripts/`, so it fits existing script patterns (see
  `tools/scripts/content-audit.ts` for an analogue CI-guard pattern).
- Bad, because it adds a dev-dependency (mitigated by pinning version in
  `package.json`).
- Bad, because WASM HarfBuzz has a cold-start cost (~1-2s per run) — acceptable
  for a CI step invoked at most once per PR that changes icons.

### Option 2 — `pyftsubset` (Python fonttools)

- Good, because `fonttools` is the reference implementation and supports every
  subsetting flag.
- Bad, because it requires a Python runtime on developer machines (Windows
  primary environment) and CI. IntelliFlow has no existing Python runtime
  dependency.
- Bad, because it adds cross-ecosystem tooling to a TypeScript monorepo.

### Option 3 — Hosted Google Fonts CSS API

- Good, because Google Fonts automatically subsets based on the icon names in
  the URL query string and serves over a CDN.
- Bad, because it violates the self-hosted font decision encoded in
  `apps/web/src/app/layout.tsx` (`next/font/local`), which was chosen for
  offline dev, CSP compliance, and GDPR/third-party-transfer constraints.
- Bad, because it introduces an external CDN dependency on the critical
  rendering path.
- Bad, because a single URL hosting all ~200 icons must be maintained by hand
  (Google's Symbols query has a max length that overflows).

### Option 4 — Replace Material Symbols with SVG components

- Good, because it removes the font entirely and guarantees every icon is
  tree-shakeable.
- Bad, because it requires rewriting 1,559 call sites, touching every UI
  surface — a migration of weeks, not days.
- Bad, because it changes the visual design system in a PR scoped to a
  performance fix (PG-195 charter is explicitly "zero visual regressions").
- Out of scope for the current sprint; may be revisited as a separate ADR if
  the icon surface outgrows Material Symbols.

## Links

- PG-195 task — `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
  (row 571)
- Baseline Lighthouse — `artifacts/lighthouse/pg-056-500-r1.json`
- PG-056 attestation — `.specify/sprints/sprint-17/attestations/PG-056/attestation.json`
- Related ADR — `docs/planning/adr/ADR-018-performance-load-testing.md`
- Resource budgets — `apps/web/CLAUDE.md`, `docs/claude-refs/nonfunctional.md`

## Implementation Notes

### Setup

```bash
# Add dev dependency to root workspace
pnpm add -D -w subset-font
```

### Subsetter script (`tools/scripts/subset-material-symbols.mjs`)

Three modes:

1. **default (regenerate)**: scan production source, extract unique
   ligature/codepoint set, static-instance variable axes at `wght=400,FILL=0,
   GRAD=0,opsz=24`, emit subsetted woff2 + audit JSON.
2. **`--verify`**: re-scan source, compare discovered glyph set against
   `artifacts/perf/material-symbols-glyph-audit.json`. Exit 0 if the audit is
   a superset of the discovered set; exit 1 with a diff otherwise.
3. **`--check-size`**: assert the woff2 on disk is <500 KB. Used by CI.

### Input / Output

- Input: `apps/web/public/fonts/MaterialSymbolsOutlined.woff2` (the current
  upstream file, treated as the unsubsetted source of truth).
- Outputs (both committed):
  - `apps/web/public/fonts/MaterialSymbolsOutlined.woff2` (replaces input in
    place; same path so `layout.tsx` is unchanged in shape).
  - `artifacts/perf/material-symbols-glyph-audit.json` — sorted unique icon
    name list with sha256 of source scan inputs for reproducibility.

### `layout.tsx` change

`weight: '100 700'` becomes `weight: '400'` — the subsetted output is a
static-instance at wght=400; the Next.js `localFont` weight hint must match so
the generated `@font-face` descriptor is accurate (otherwise Chrome synthesizes
weight, harming CLS scores).

### CI Guard

Add to `apps/web`'s `package.json` (or `turbo.json` pipeline) a script that
runs before Lighthouse CI:

```json
"scripts": {
  "audit:material-symbols": "node ../../tools/scripts/subset-material-symbols.mjs --verify"
}
```

Plus a CI workflow step that runs the verify target on every PR that touches
`apps/web/src/**`, `packages/ui/src/**`, or the font/audit files.

### Validation Criteria

- [ ] Subsetted woff2 <500 KB (`stat` check + CI `--check-size`).
- [ ] `artifacts/perf/material-symbols-glyph-audit.json` lists every unique
      icon name from production source.
- [ ] Lighthouse Performance ≥90 on `/404` and `/500` (desktop production
      build) — evidence: `artifacts/lighthouse/pg-195-post-subset-{404,500}.json`.
- [ ] Visual regression: manual spot-check of 20 representative pages
      confirms zero tofu; Playwright smoke run executes with no console
      font-loading errors.
- [ ] CI guard fails when an icon literal is added to source but the audit is
      not regenerated.
- [ ] `pnpm --filter @intelliflow/web build` succeeds; `pnpm --filter
      @intelliflow/web typecheck` and `pnpm --filter @intelliflow/web test
      --run` pass.

### Rollback Plan

If the subsetted font breaks icons in production:

1. Revert the three changed files in one commit:
   - `apps/web/public/fonts/MaterialSymbolsOutlined.woff2`
   - `artifacts/perf/material-symbols-glyph-audit.json`
   - `apps/web/src/app/layout.tsx` (weight range)
2. The subsetter script itself is backwards-safe (idempotent regenerate); it
   can stay on `main`.
3. Ship a hotfix by re-downloading the upstream unsubsetted woff2 from the
   Google Fonts repo (SHA recorded in the script) and re-running the
   subsetter with the expanded icon set.

---

**Note**: this ADR applies only to the Material Symbols icon font. Other
web-font decisions (Inter, brand display faces) are out of scope.
