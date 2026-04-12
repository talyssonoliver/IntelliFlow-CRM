# ADR-040: Calendar UI Library — Schedule-X

**Status:** Accepted **Date:** 2026-02-28 **Deciders:** Frontend Lead, Product
Lead **Related Tasks:** PG-139, PG-136

## Context and Problem

IntelliFlow CRM has two hand-rolled calendar components:

- `AppointmentCalendar.tsx` (621 lines) — month/week/day views for `/calendar`
- `TaskCalendar.tsx` (209 lines) — month-only for `/tasks`

Together they contain ~830 lines of custom date math, HTML table rendering, and
grid layout. This code is fragile, lacks drag-and-drop, and requires significant
maintenance for each new calendar feature.

## Decision Drivers

- **Bundle size** — CRM pages are already JS-heavy; calendar lib must be small.
- **Custom rendering** — Appointment chips use type/status colors and conflict
  indicators; the library must support custom event components.
- **Theming** — Must bridge to our CSS variable design system (Tailwind/shadcn).
- **Lazy loading** — Calendar is below the fold; must support `next/dynamic`.
- **TypeScript-first** — Full type safety with no `@types/*` shim.

## Considered Options

| Library            | Bundle (gzip) | Custom Render          | Theme System   | Tree-shake | TS Native |
| ------------------ | ------------- | ---------------------- | -------------- | ---------- | --------- |
| **Schedule-X**     | ~30 KB        | `customComponents` API | CSS variables  | Yes        | Yes       |
| react-big-calendar | ~50 KB        | `components` override  | SASS/className | No         | `@types`  |
| FullCalendar       | ~75 KB+       | Event render hooks     | CSS variables  | Partial    | Yes       |
| EventCalendar      | ~40 KB        | Svelte slots           | CSS variables  | Yes        | Yes       |

## Decision

**Schedule-X** — smallest bundle, first-class React support via
`useNextCalendarApp` (SSR-safe), CSS variable theming that bridges directly to
our design tokens, and a `customComponents` API that lets us render our existing
appointment/task chips inside the calendar grid.

## Implementation Notes

### Packages

```
@schedule-x/calendar @schedule-x/react @schedule-x/theme-default
@schedule-x/events-service temporal-polyfill
```

### Architecture

- **Inner components** (`AppointmentCalendarInner.tsx`, `TaskCalendarInner.tsx`)
  contain Schedule-X integration code plus Temporal polyfill and CSS imports.
- **Shell components** (`AppointmentCalendar.tsx`, `TaskCalendar.tsx`) keep the
  header navigation, view switcher, loading skeleton, and empty state. They
  import inner components via `next/dynamic({ ssr: false })`.
- Props interfaces are **unchanged** — no consumer code changes required.

### CSS Bridge

`globals.css` maps `--sx-*` variables to existing `--primary`, `--background`,
etc. Schedule-X's built-in header is hidden
(`.sx__calendar-header { display: none }`).

### Test Strategy

Inner components are mocked in unit tests (`vi.mock('next/dynamic')`). Shell
component tests verify header behavior, navigation, view switching, and callback
wiring. Schedule-X rendering is tested via manual/E2E testing.

## Consequences

**Positive:** ~800 lines of custom date math removed; drag-and-drop support
available via plugin; new calendar views can be added with one line.

**Negative:** Runtime dependency on `temporal-polyfill` (~8 KB gzip); Schedule-X
API changes require inner component updates.

## Rollback Plan

Revert to the previous commit containing the hand-rolled calendar components. No
data model or API changes were made, so rollback is purely frontend.

## Verification

- TypeScript: zero errors in calendar files
- Tests: 26/26 passing (AppointmentCalendar + TaskCalendar)
- Lint: clean
- Build: no calendar-related errors
- Props interfaces unchanged — zero consumer page changes required

## Links

- ADR-024-scheduling-calendar.md (sync/conflict decisions — unaffected)
- PRD: prd-scheduling-calendar.md
- Spec: PG-139-spec.md
