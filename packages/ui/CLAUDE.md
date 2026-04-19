# packages/ui — Shared UI Components (shadcn/ui)

## Purpose

Shared React component library based on shadcn/ui. Used by `apps/web/` for
consistent UI across the CRM.

## Structure

```
src/
├── components/    # shadcn/ui-based components (Button, Card, Dialog, etc.)
├── hooks/         # Shared React hooks
├── lib/           # Utility functions (cn, formatters)
└── index.ts       # Barrel exports
```

## Key Rules

1. **shadcn/ui based**: All components extend shadcn/ui primitives with Tailwind
   CSS
2. **Brand compliant**: Must follow IntelliFlow design system (see
   `docs/company/brand/DESIGN_SYSTEM_LLM_INDEX.md`)
3. **Accessibility**: WCAG 2.1 AA compliance required
4. **No business logic**: Pure presentation components only — business logic
   lives in domain/application layers
5. **Responsive**: Mobile-first design, all breakpoints supported

## Adding Components

```bash
# Add a new shadcn/ui component
npx shadcn@latest add <component-name>
```

## Usage in apps/web

```typescript
import { Button, Card, Dialog } from '@intelliflow/ui';
```

## Testing

- Component tests with Vitest + Testing Library
- Visual regression with Storybook (when available)
- Lighthouse accessibility audit: score must be >= 90

## Icons (PG-195 / ADR-046)

Material Symbols Outlined is the ONLY icon library used anywhere in the
monorepo, including every component shipped from `packages/ui`. Do NOT import
from `lucide-react`, `@heroicons/react`, `react-icons`, `@radix-ui/react-icons`,
or `react-feather`. Use
`<span className="material-symbols-outlined">name</span>` or the shared
`Icon`/`IconBadge` wrappers; the canonical name set lives in
`packages/ui/src/lib/icon-mapping.ts` and
`artifacts/reports/material-symbols-glyph-audit.json`.

Full policy: **`docs/design/ICON_USAGE.md`** — read that before adding,
renaming, or replacing any icon in this package.

## Empty-State Illustrations (PG-195 follow-on)

`packages/ui/src/components/empty-state-illustrations.tsx` holds 30 curated SVG
illustrations, one per CRM entity, wired into `<EmptyState>` via the
`ENTITY_ILLUSTRATIONS` map. `<EmptyState entity='...' />` is the only supported
path for CRM-entity zero states anywhere in the monorepo.

Do NOT:

- Add a parallel `FooIllustration` component elsewhere in this package or in
  `apps/web`.
- Inline a `<svg>` in a consumer's page as an empty-state graphic.
- Ship a consumer of `<EmptyState>` without `entity=` unless a full
  `title + description + illustration` trio is provided.

To add a new entity: update `EmptyStateEntity` union +
`ENTITY_EMPTY_STATE_CONFIG` in `entity-empty-state-config.ts`, append the
illustration function to `empty-state-illustrations.tsx`, register it in
`ENTITY_ILLUSTRATIONS`, and export from `index.ts`.

Full policy, the 30 entities with when-to-use hints, variant rules:
**`docs/design/EMPTY_STATES.md`**.
