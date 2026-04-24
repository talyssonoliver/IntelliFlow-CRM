# ADR-051: Public Product Tour — Custom Lightweight Implementation

**Status:** Accepted

**Date:** 2026-04-24

**Deciders:** Growth FE Lead, UX Designer, Tech Lead; ratified at exec-time by Claude Code per the PG-126 attestation on 2026-04-24.

**Technical Story:** PG-126

## Context and Problem Statement

PG-126 introduces a guided product tour on public marketing pages (`/` and
`/features`) and a public-visitor feedback widget. The tour must highlight DOM
targets, show tooltips, support keyboard navigation, trap focus, and instrument
analytics events. Two implementation paths are possible: adopt an existing tour
library (react-joyride, driver.js, shepherd.js, intro.js), or build a minimal
custom component using existing shadcn/ui primitives (`Dialog`, `Popover`).

Which path respects the project's bundle budget (JS < 300 KB total, CSS < 50
KB per `apps/web/CLAUDE.md`), icon policy (Material Symbols only per ADR-046),
and avoids introducing a dependency that will be used by a single surface?

## Decision Drivers

- **Bundle budget** — Adding a library that ships its own DOM utility layer
  and CSS conflicts with the < 300 KB JS budget and Lighthouse >= 0.90 target
- **Icon policy** — Third-party tour libraries often ship their own icons
  (SVGs or icon fonts) that violate ADR-046 (Material Symbols Outlined only)
- **A11y ownership** — We need WCAG 2.1 AA on every public surface; a library
  that quietly drops focus trap or ARIA wiring is harder to audit than custom
  code
- **Single-surface use** — This tour only runs on `/` and `/features` today.
  Investing in a full library for two surfaces is premature.
- **Existing infrastructure** — shadcn/ui `Dialog` + Radix `Popover`
  (`packages/ui/src/components/dialog.tsx`) already provide portal, focus trap,
  Esc handler, and ARIA scaffolding
- **Analytics contract** — Tour events must flow through existing
  `tracking-pixel.ts` (Do-Not-Track-aware); a library with its own analytics
  callbacks is an integration risk

## Considered Options

1. **react-joyride** — mature React tour library, ~50 KB gzipped
2. **driver.js** — vanilla JS, ~8 KB gzipped, React wrapper available
3. **shepherd.js** — Tippy-based, ~20 KB gzipped
4. **Custom lightweight tour** — built on shadcn `Dialog` + custom
   positioning, ~3–5 KB gzipped additional

## Decision Outcome

Chosen option: **Custom lightweight tour**, because:

- It respects the < 300 KB JS budget and the < 25 KB gzipped budget declared
  in PRD NFR-1
- It reuses shadcn/ui `Dialog` (already in the bundle), Material Symbols for
  navigation icons, and the existing `tracking-pixel` utility — no new
  dependencies
- A11y wiring is explicit and auditable; we own every ARIA attribute
- Config stays JSON-driven (`artifacts/misc/onboarding-config.json`), so
  changing tour content does not require a library upgrade
- The scope is two surfaces today; if PG-126 follow-ups expand the tour to
  dozens of routes, this ADR can be revisited to adopt a library

### Positive Consequences

- No new dependencies in `apps/web/package.json`
- Full control over focus management, reduced-motion handling, and event
  schema
- Tour config JSON is version-controlled and testable
- Bundle stays under budget; Lighthouse >= 0.90 stays green

### Negative Consequences

- We must maintain the positioning / viewport-clipping logic ourselves
  (approximately 80–120 LOC)
- If we later add complex tour shapes (branching tours, conditional steps), we
  will re-evaluate this decision
- No third-party ecosystem of pre-built step transitions — we render only what
  we ship

## Pros and Cons of the Options

### react-joyride

- Good, because mature, well-tested, React-friendly API
- Good, because handles positioning and clipping out of the box
- Bad, because ~50 KB gzipped is the full PG-126 NFR-1 budget alone
- Bad, because ships its own inline-styled overlay that conflicts with the
  design-token system (ADR-045) and requires theme overrides
- Bad, because pulls in `react-floater`, which we'd use nowhere else

### driver.js

- Good, because small (~8 KB)
- Bad, because vanilla DOM API; React integration requires a wrapper
- Bad, because its own popover/icon CSS competes with shadcn primitives
- Bad, because replacement of the library would be disruptive

### shepherd.js

- Good, because Tippy-based positioning is battle-tested
- Bad, because ~20 KB gzipped plus Tippy's own overlay styling
- Bad, because Tippy is not used anywhere else in the codebase

### Custom lightweight tour

- Good, because zero new dependencies, full ownership, design-token aligned
- Good, because explicit a11y wiring we can audit line-by-line
- Good, because easy to delete/replace if tour content moves to a CMS
- Bad, because we hand-roll positioning logic
- Bad, because no built-in support for complex tour shapes (branching, etc.)

## Implementation Notes

- Tour component location: `apps/web/src/components/public/tour-components.tsx`
  (canonical per PG-126 CSV artifact path)
- Tour engine exports: `PublicTour`, `TourStep`, `useTourState`,
  `TourTriggerButton`
- Feedback service location:
  `apps/web/src/lib/public/feedback-service.ts`
- Feedback service exports: `submitPublicFeedback`, `publicFeedbackSchema`
- Tour config location: `artifacts/misc/onboarding-config.json`
- Tour config schema: co-located zod schema in
  `packages/validators/src/public-onboarding.ts`
- Public feedback endpoint: tRPC `publicFeedback.submit` with a public
  procedure (no tenant context), rate-limited by IP at the router level,
  persisted through a new `PublicFeedback` Prisma model

## Positioning Strategy

- Absolute-positioned portal anchor using
  `getBoundingClientRect()` on the target element
- Recompute on window `resize` and `scroll` within a throttled callback
- Fallback to centred modal when target is null or off-screen
- Respect `prefers-reduced-motion` by disabling transitions

## References

- ADR-045: Entity Detail Componentization — established preference for
  composing shadcn primitives over introducing new libraries
- ADR-046: Material Symbols Font Subsetting — icon policy
- `apps/web/CLAUDE.md` — bundle budget, Lighthouse targets
- `docs/design/EMPTY_STATES.md` — shared-component reuse discipline
