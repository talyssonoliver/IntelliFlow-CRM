# Context Pack — PG-001 (Home Page)
- **run_id:** 20251230-234616-PG-001-b7c6
- **scope:** Public marketing home page (`/`) with artifacts `apps/web/src/app/(public)/{page,loading,error}.tsx`, `artifacts/misc/seo-meta.json`

## Task & Definition of Done
- Task PG-001 (Sprint 11, Public Pages) with dependencies IFC-076, GTM-002, BRAND-001 all marked DONE (.specify/specifications/PG-001.md, .specify/planning/PG-001.md).
- DoD: response <200ms, Lighthouse ≥90, SEO optimized; produce page.tsx, loading.tsx, error.tsx, and pass lighthouse-gte-90 gate.
- Context controls: build context pack + ack before coding; follow STOA constitution and audit-matrix.

## Brand & Messaging References
- Positioning: “AI-first CRM that pairs automation with governance-grade validation” with pillars (automation + safeguards, clear gates, modern stack, observability) (docs/company/messaging/positioning.md).
- Visual identity: primary blue #137fec (hover #0e6ac7); light bg #f6f7f8, surface #ffffff; typography Inter with defined scale (H1 48px, H2 36px); spacing 4px scale; rounded lg=8px; Material Symbols icons (docs/company/brand/visual-identity.md).
- Style guide: use btn-primary, card, badge, data-table patterns; one primary CTA, consistent spacing, dark mode variants, responsive grids, focus rings; brand color tokens not arbitrary hex (docs/company/brand/style-guide.md, docs/company/brand/dos-and-donts.md).
- Accessibility patterns: WCAG 2.1 AA, focus-visible rings, semantic headings/nav, aria-labels for icon-only, skip link target, aria-live for status, form labels, dark mode contrast (docs/company/brand/accessibility-patterns.md). Accessibility audit certifies shadcn components (artifacts/misc/accessibility-audit.json).

## Sitemap & Routing
- Sitemap lists `/` as PG-001 plus `/features`, `/pricing`, `/about`, `/contact`, `/partners`, `/press`, `/security` under public pages (docs/design/sitemap.md).
- Page registry path convention: `apps/web/src/app/{route}/page.tsx`; route groups used to share layout; public layout exists at `apps/web/src/app/(public)/layout.tsx` (docs/design/page-registry.md).

## Governance & Gates
- Constitution: Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui from packages/ui, TypeScript strict, no `any`, avoid console.log in prod; performance budgets (FCP <1s); tests required.
- Audit matrix baseline gates include turbo-typecheck, turbo-build, turbo-test-coverage (90%), eslint-max-warnings-0, prettier-check, commitlint; security gates (gitleaks, pnpm-audit-high, snyk, semgrep, trivy-image) enabled and required; lighthouse-ci optional tier3 (audit-matrix.yml).
- Evidence placement must stay under `artifacts/attestations/PG-001/` for this task; no runtime artifacts under docs metrics (Framework.md).

## Key UX Notes for Home Page
- Use Material Symbols icons, CTA cadence: single primary CTA + secondary link; consistent card padding (p-6), metric cards with brand accent; dark mode support.
- Maintain semantic sections (`section`, `nav`, `main`), heading hierarchy H1→H2→H3, visible focus indicators, keyboard-friendly links/buttons.
- Optimize for SEO: descriptive title/description, canonical URL, OG/Twitter meta, avoid blocking scripts; align with performance targets from seo-meta.json (LCP <2.5s, CLS <0.1, FID <100ms).
