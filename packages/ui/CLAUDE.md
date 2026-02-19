# packages/ui — Shared UI Components (shadcn/ui)

## Purpose

Shared React component library based on shadcn/ui. Used by `apps/web/` for consistent UI across the CRM.

## Structure

```
src/
├── components/    # shadcn/ui-based components (Button, Card, Dialog, etc.)
├── hooks/         # Shared React hooks
├── lib/           # Utility functions (cn, formatters)
└── index.ts       # Barrel exports
```

## Key Rules

1. **shadcn/ui based**: All components extend shadcn/ui primitives with Tailwind CSS
2. **Brand compliant**: Must follow IntelliFlow design system (see `docs/company/brand/DESIGN_SYSTEM_LLM_INDEX.md`)
3. **Accessibility**: WCAG 2.1 AA compliance required
4. **No business logic**: Pure presentation components only — business logic lives in domain/application layers
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
