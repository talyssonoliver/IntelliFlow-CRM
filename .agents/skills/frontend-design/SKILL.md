---
name: frontend-design
description:
  Create distinctive, production-grade frontend interfaces for IntelliFlow CRM
  with high design quality. Use this skill when building CRM components,
  dashboards, lead management UIs, pipeline views, or any IntelliFlow web
  interface. Generates polished React/Next.js code using shadcn/ui and Tailwind
  CSS.
license: Complete terms in LICENSE.txt
---

This skill guides creation of production-grade frontend interfaces for
IntelliFlow CRM following the established design system.

## Tech Stack

- **Framework**: Next.js 16.0.10 (App Router), React 19, TypeScript (strict
  mode)
- **UI Library**: Radix UI primitives + shadcn/ui patterns (encapsulated in
  `@intelliflow/ui`)
- **Styling**: Tailwind CSS 3.4.17 + CSS variables for theming
- **Forms**: React Hook Form + Zod validation
- **Icons**: Material Symbols Outlined (MANDATORY - NOT Lucide React)
- **Testing**: Vitest + @testing-library/react + vitest-axe

## MANDATORY Component Import Pattern

**CORRECT:**

```tsx
import { Card, Button, Input, Toast } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';
```

**NEVER:**

```tsx
import { Dialog } from '@radix-ui/react-dialog'; // Bypass encapsulation
import { Button } from '@/components/ui/button'; // Wrong path
import { CheckCircle } from 'lucide-react'; // Wrong icon system
```

## Two Color Approaches (MANDATORY)

### Approach 1: CSS Variables (Semantic Colors)

```tsx
<div className="text-primary">                    // Brand blue (#137fec)
<div className="bg-primary text-primary-foreground">  // Primary buttons
<div className="text-destructive">                // Errors, danger
<div className="bg-success text-white">           // Success states
<div className="text-muted-foreground">           // Secondary text
```

### Approach 2: Explicit Slate Colors (Visual Hierarchy)

```tsx
// Container backgrounds
<div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">

// Subtle backgrounds (filter bars, headers)
<div className="bg-slate-50 dark:bg-slate-800/50">

// Hover states
<div className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">

// Text hierarchy
<h1 className="text-slate-900 dark:text-white">           // Primary text
<p className="text-slate-600 dark:text-slate-300">        // Body text
<span className="text-slate-500 dark:text-slate-400">     // Secondary text
```

### When to Use Each

| Use Case         | Approach       | Example                                  |
| ---------------- | -------------- | ---------------------------------------- |
| Buttons (brand)  | CSS Variables  | `bg-primary text-primary-foreground`     |
| Error states     | CSS Variables  | `text-destructive border-destructive`    |
| Card backgrounds | Explicit Slate | `bg-white dark:bg-slate-800`             |
| Filter bar       | Explicit Slate | `bg-slate-50 dark:bg-slate-800/50`       |
| Borders          | Explicit Slate | `border-slate-200 dark:border-slate-700` |

## MANDATORY Patterns

### Icon Pattern (Material Symbols)

```tsx
<span className="material-symbols-outlined text-xl" aria-hidden="true">
  check_circle
</span>
```

### AppSidebar Pattern (MANDATORY for all modules)

```tsx
import {
  SidebarProvider,
  AppSidebar,
  SidebarInset,
  SidebarTrigger,
  leadsSidebarConfig,
} from '@/components/sidebar';

export default function LeadsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar config={leadsSidebarConfig} />
        <SidebarInset>
          <main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
```

### PageHeader Pattern (MANDATORY for all pages)

```tsx
import { PageHeader } from '@/components/shared';

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Leads' }]}
        title="All Leads"
        description="Manage and track your sales leads"
        actions={[
          {
            label: 'Add Lead',
            icon: 'add',
            variant: 'primary',
            href: '/leads/new',
          },
        ]}
      />
      {/* Page content */}
    </div>
  );
}
```

## Typography Guidelines

- **Page Titles**: `text-2xl font-bold tracking-tight`
- **Section Headers**: `text-lg font-semibold`
- **Card Titles**: `text-base font-medium`
- **Body Text**: `text-sm`
- **Labels**: `text-xs text-muted-foreground uppercase tracking-wide`

## Quality Gates (NO ERRORS ALLOWED)

```bash
pnpm typecheck           # Must pass
pnpm test                # Must pass with 90%+ coverage
pnpm lint                # No errors
pnpm build               # Must succeed
```

## NEVER DO THIS

- No `any` types, no `@ts-ignore`
- No `console.log`, `TODO`, or placeholder code
- No custom sidebars (use AppSidebar)
- No inline headers (use PageHeader)
- No direct Radix imports
- No Lucide React icons

## Source Documents

- `docs/design/UI_DEVELOPMENT_PROMPT.md` - Full development guide
- `docs/company/brand/DESIGN_SYSTEM_LLM_INDEX.md` - Design tokens
- `packages/ui/src/components/` - Reference implementations
