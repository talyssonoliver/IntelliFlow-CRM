# IntelliFlow CRM - UI Development Session Prompt

> **Purpose**: Standardized prompt for Claude Code sessions focused on UI development
> **Version**: 1.0
> **Last Updated**: 2025-12-31
---

## 🎯 SESSION OBJECTIVE

You are working on **IntelliFlow CRM**, a production-grade AI-first CRM system with governance-first architecture. Your role is to implement UI features that are:

- ✅ **Consistent** with the established design system
- ✅ **Production-ready** (no placeholders, drafts, or TODOs)
- ✅ **Fully tested** (90%+ coverage, passing TypeScript, no errors)
- ✅ **Properly documented** (Storybook stories, attestations, Sprint_plan.csv updates)
- ✅ **Integrated** with existing codebase (no scattered code)

**CRITICAL**: No drift from existing patterns. No placeholders. No "TODO" comments. No errors tolerated.

---

## 📚 CODEBASE CONTEXT

### Project Structure

```
intelliFlow-CRM/
├── apps/
│   ├── web/                           # Next.js 16 frontend (App Router)
│   │   ├── src/app/                   # Pages (route groups, layouts)
│   │   ├── src/components/            # App-specific components
│   │   ├── src/lib/                   # Utilities, tRPC client
│   │   ├── tailwind.config.ts         # Tailwind + design tokens
│   │   └── src/app/globals.css        # CSS variables (theme)
│   ├── api/                           # tRPC API server
│   └── project-tracker/               # Sprint tracking dashboard
│       └── docs/metrics/_global/
│           ├── Sprint_plan.csv        # **SINGLE SOURCE OF TRUTH**
│           └── Sprint_plan_*.csv      # Split files (A-D for reading)
├── packages/
│   ├── ui/                            # **DESIGN SYSTEM PACKAGE**
│   │   ├── src/components/            # Reusable components (47 files)
│   │   ├── __tests__/                 # Component tests (Vitest + axe)
│   │   ├── .storybook/                # Storybook documentation
│   │   └── src/lib/utils.ts           # cn() utility, helpers
│   ├── domain/                        # Domain models (DDD)
│   ├── application/                   # Use cases, ports
│   ├── adapters/                      # Infrastructure (repos, APIs)
│   ├── validators/                    # Zod schemas
│   └── db/                            # Prisma schema, client
├── docs/
│   ├── design/
│   │   ├── UI_CONSOLIDATION_PLAN.md   # **READ THIS FIRST**
│   │   ├── page-registry.md           # Route → mockup mapping
│   │   ├── sitemap.md                 # Full app structure (~90 pages)
│   │   └── mockups/                   # 28 design mockups (PNG + HTML)
│   └── company/brand/
│       ├── palette.tokens.json        # Color system (85 lines)
│       ├── typography.tokens.json     # Type scale (149 lines)
│       ├── spacing.tokens.json        # Spacing/shadows (100 lines)
│       ├── style-guide.md             # Component patterns (845 lines)
│       └── visual-identity.md         # Brand guidelines
└── artifacts/
    └── attestations/                  # Task completion evidence
        └── [TASK-ID]/
            ├── attestation.json       # Completion proof
            ├── context_pack.md        # Implementation context
            └── context_ack.json       # Validation results
```

### Technology Stack

- **Frontend**: Next.js 16.0.10 (App Router), React 19, TypeScript (strict mode)
- **UI Library**: Radix UI primitives + shadcn/ui patterns (encapsulated in `@intelliflow/ui`)
- **Styling**: Tailwind CSS 3.4.17 + CSS variables for theming
- **Forms**: React Hook Form + Zod validation
- **Icons**: Material Symbols Outlined (414 occurrences)
- **Testing**: Vitest + @testing-library/react + vitest-axe
- **Documentation**: Storybook 8.4.7 with a11y addon
- **API**: tRPC (type-safe API layer)
- **Database**: Supabase PostgreSQL + Prisma ORM

---

## 🎨 DESIGN SYSTEM (MANDATORY STANDARDS)

### Color System - Two Approaches

IntelliFlow uses **two complementary color approaches** for maximum design control:

1. **CSS Variables** - For semantic colors (primary, destructive, success)
2. **Explicit Slate Colors** - For visual hierarchy and layering

---

#### Approach 1: CSS Variables (Semantic Colors)

Use CSS variables for **brand colors** and **semantic meaning**:

```tsx
// Brand and semantic colors
<div className="text-primary">                    // Brand blue
<div className="bg-primary text-primary-foreground">  // Primary buttons
<div className="text-destructive">                // Errors, danger
<div className="bg-success text-white">           // Success states
<div className="text-muted-foreground">           // Secondary text
```

---

#### Approach 2: Explicit Slate Colors (Visual Hierarchy)

Use explicit slate colors for **visual layering** and **subtle backgrounds**:

```tsx
// Container backgrounds (white on light, slate-800 on dark)
<div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">

// Subtle backgrounds (slate-50 on light, slate-800/50 on dark)
<div className="bg-slate-50 dark:bg-slate-800/50">

// Hover states with transitions
<div className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">

// Text hierarchy
<h1 className="text-slate-900 dark:text-white">           // Primary text
<p className="text-slate-600 dark:text-slate-300">        // Body text
<span className="text-slate-500 dark:text-slate-400">     // Secondary text
<span className="text-slate-400 dark:text-slate-500">     // Muted text

// Borders
<div className="border border-slate-200 dark:border-slate-700">

// Table headers
<th className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
```

---

#### When to Use Each Approach

| Use Case | Approach | Example |
|----------|----------|---------|
| Buttons (brand) | CSS Variables | `bg-primary text-primary-foreground` |
| Error states | CSS Variables | `text-destructive border-destructive` |
| Success badges | CSS Variables | `bg-success text-white` |
| Card backgrounds | Explicit Slate | `bg-white dark:bg-slate-800` |
| Filter bar background | Explicit Slate | `bg-slate-50 dark:bg-slate-800/50` |
| Table headers | Explicit Slate | `bg-slate-50 dark:bg-slate-800/50` |
| Hover effects | Explicit Slate | `hover:bg-slate-50 dark:hover:bg-slate-800/50` |
| Borders | Explicit Slate | `border-slate-200 dark:border-slate-700` |
| Text hierarchy | Explicit Slate | `text-slate-900 dark:text-white` |

---

#### ❌ NEVER USE

```tsx
// Custom Tailwind tokens (not in our design system)
<div className="bg-ds-primary">

// Dynamic Tailwind classes (breaks purging)
<div className={`bg-blue-${100 + i * 100}`}>

// Inline styles for theme values
<div style={{ color: '#137fec' }}>
<div style={{ backgroundColor: '#f1f5f9' }}>
```

### Available CSS Variables

**Location**: `apps/web/src/app/globals.css`

```css
/* Light mode (default) */
--background: #f6f7f8;           /* Page background */
--foreground: #0f172a;           /* Primary text */
--primary: #137fec;              /* Brand blue */
--primary-foreground: #ffffff;   /* Text on primary */
--secondary: #64748b;            /* Secondary actions */
--accent: #7cc4ff;               /* Highlights */
--muted: #f1f5f9;                /* Subtle backgrounds */
--border: #e2e8f0;               /* Borders */
--card: #ffffff;                 /* Card backgrounds */
--card-foreground: #0f172a;      /* Text on cards */
--destructive: #ef4444;          /* Error/danger */
--success: #10b981;              /* Success states */

/* Dark mode (auto-switches with .dark class) */
.dark {
  --background: #101922;
  --foreground: #f8fafc;
  --primary: #137fec;            /* Same brand blue */
  --card: #1e2936;
  --border: #334155;
}
```

**Usage in Tailwind**:
```tsx
className="bg-background text-foreground"
className="bg-card text-card-foreground border-border"
className="bg-primary text-primary-foreground"
className="bg-destructive text-destructive-foreground"
className="bg-muted text-muted-foreground"
```

### Component Import Pattern

**✅ CORRECT**:
```tsx
import { Card, Button, Input, Toast } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';
```

**❌ NEVER**:
```tsx
import { Dialog } from '@radix-ui/react-dialog';  // ❌ Bypass encapsulation
import { Button } from '@/components/ui/button';  // ❌ Wrong path
```

### Icon Pattern

**✅ CORRECT** (Material Symbols Outlined):
```tsx
<span className="material-symbols-outlined text-xl" aria-hidden="true">
  check_circle
</span>
```

**❌ AVOID** (Lucide - only 5 occurrences, being phased out):
```tsx
import { CheckCircle } from 'lucide-react';  // ❌ Inconsistent
```

### Component Patterns

**Follow existing patterns** from `packages/ui/src/components/`:

1. **Button**: CVA-based variants, 4 sizes, 6 variants
2. **Card**: Simple wrapper with header/content/footer sub-components
3. **Input**: Validation states, icons, labels
4. **Form**: React Hook Form + Zod integration
5. **Toast**: Success/error/default variants
6. **Data Table**: TanStack Table integration
7. **Layout Builder**: Widget system (7 files) - **USE THIS** for dashboards

**Reference implementations**:
- Simple component: `packages/ui/src/components/button.tsx`
- Complex component: `packages/ui/src/components/data-table.tsx`
- Form integration: `packages/ui/src/components/form.tsx`
- Layout system: `packages/ui/src/components/layout-builder/`

---

## 🧪 QUALITY GATES (NO ERRORS ALLOWED)

### TypeScript Validation

**Run before committing**:
```bash
pnpm run typecheck        # All packages
pnpm --filter web typecheck
pnpm --filter @intelliflow/ui typecheck
```

**Requirements**:
- ✅ No `any` types (use strict mode)
- ✅ No `@ts-ignore` comments
- ✅ All props properly typed
- ✅ Generic types where appropriate
- ✅ No implicit returns

### Test Coverage

**Run tests**:
```bash
pnpm run test             # All tests
pnpm --filter @intelliflow/ui test
pnpm run test:coverage    # Coverage report
```

**Requirements**:
- ✅ 90%+ coverage (enforced in CI)
- ✅ All component variants tested
- ✅ Accessibility tests with vitest-axe
- ✅ User interaction tests
- ✅ Error state tests

**Test Template** (`packages/ui/__tests__/[component].test.tsx`):
```tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ComponentName } from '../src/components/component-name';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName>Content</ComponentName>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ComponentName>Content</ComponentName>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('supports all variants', () => {
    // Test each variant
  });
});
```

### Linting

```bash
pnpm run lint             # ESLint
pnpm run format           # Prettier
```

**Requirements**:
- ✅ No ESLint errors (warnings acceptable)
- ✅ Prettier formatted
- ✅ No console.log statements (use proper logging)

### Build Validation

```bash
pnpm run build            # All packages
pnpm --filter web build
pnpm --filter @intelliflow/ui build
```

**Requirements**:
- ✅ No build errors
- ✅ No missing dependencies
- ✅ Bundle size within limits

---

## 📝 DOCUMENTATION REQUIREMENTS

### 1. Storybook Story

**Every component** in `packages/ui/src/components/` must have a Storybook story.

**Location**: `packages/ui/src/components/[component].stories.tsx`

**Template**:
```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentName } from './component-name';

const meta: Meta<typeof ComponentName> = {
  title: 'Components/ComponentName',
  component: ComponentName,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'success'],
      description: 'Visual variant of the component',
    },
  },
};

export default meta;
type Story = StoryObj<typeof ComponentName>;

export const Default: Story = {
  args: {
    children: 'Default content',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Error content',
  },
};
```

**Run Storybook**:
```bash
pnpm --filter @intelliflow/ui storybook
```

### 2. Sprint Plan Updates

**CRITICAL**: Update `Sprint_plan.csv` when completing tasks.

**Location**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`

**Steps**:
1. Find your task row by Task ID (e.g., `IFC-090`, `PG-015`)
2. Update `Status` column: `"Planned"` → `"Completed"`
3. Verify `Artifacts To Track` column lists what you created
4. Check `Definition of Done` - ensure all criteria met
5. Save and sync:
   ```bash
   cd apps/project-tracker
   npx tsx scripts/sync-metrics.ts
   ```

### 3. Attestation File

**For completed tasks**, create attestation in `artifacts/attestations/[TASK-ID]/`.

**Required files**:
```
artifacts/attestations/IFC-XXX/
├── attestation.json          # Completion proof with SHA256 hashes
├── context_pack.md           # Implementation details
└── context_ack.json          # Validation results
```

**attestation.json template**:
```json
{
  "task_id": "IFC-XXX",
  "completed_at": "2025-12-31T12:00:00Z",
  "executor": "claude-code",
  "artifacts": {
    "created": [
      {
        "path": "packages/ui/src/components/new-component.tsx",
        "sha256": "[hash]",
        "size_bytes": 1234
      }
    ]
  },
  "validations": {
    "typecheck": { "command": "pnpm typecheck", "exit_code": 0, "passed": true },
    "tests": { "command": "pnpm test", "exit_code": 0, "passed": true, "coverage": "95%" },
    "build": { "command": "pnpm build", "exit_code": 0, "passed": true }
  },
  "kpis": {
    "test_coverage": { "target": ">90%", "actual": "95%", "met": true },
    "accessibility": { "target": "WCAG 2.1 AA", "actual": "Passed", "met": true }
  }
}
```

**Generate attestation**:
```bash
# TODO: Add attestation generation script
# For now, create manually following the template
```

---

## 🚫 ANTI-PATTERNS (NEVER DO THIS)

### Code Quality

❌ **No placeholders**:
```tsx
// TODO: Implement this later  ❌
const handleSubmit = () => {
  // Placeholder  ❌
};
```

✅ **Full implementation**:
```tsx
const handleSubmit = async () => {
  if (!validateForm()) return;
  await submitData();
  router.push('/success');
};
```

---

❌ **No drift from existing patterns**:
```tsx
// Creating custom button when Button component exists  ❌
<button className="px-4 py-2 bg-blue-500">Click</button>
```

✅ **Use existing components**:
```tsx
import { Button } from '@intelliflow/ui';
<Button variant="default">Click</Button>
```

---

❌ **No scattered code**:
```tsx
// Creating component in apps/web when it should be in packages/ui  ❌
// apps/web/src/components/custom-button.tsx
export function CustomButton() { ... }
```

✅ **Proper location**:
```tsx
// packages/ui/src/components/button.tsx (if reusable)
// OR apps/web/src/components/header/login-button.tsx (if app-specific)
```

---

❌ **No hardcoded data in widgets**:
```tsx
// Dashboard widget with fake data  ❌
export function RevenueWidget() {
  const revenue = 125000;  // Hardcoded!
  return <Card>{revenue}</Card>;
}
```

✅ **Use Widget interface**:
```tsx
import { Widget, WidgetProps } from '@intelliflow/ui';

export function RevenueWidget({ config }: WidgetProps<RevenueConfig>) {
  const { data } = useRevenueData(config.period);
  return <Widget title="Revenue">{data.revenue}</Widget>;
}
```

---

❌ **No inline styles for theme values**:
```tsx
<div style={{ color: '#137fec' }}>  ❌
<div style={{ backgroundColor: '#0f172a' }}>  ❌
```

✅ **Use Tailwind classes**:
```tsx
<div className="text-primary">  ✅          // Semantic (brand blue)
<div className="text-slate-900 dark:text-white">  ✅  // Visual hierarchy
<div className="bg-slate-50 dark:bg-slate-800/50">  ✅  // Subtle background
```

### Testing

❌ **No skipped tests**:
```tsx
it.skip('should handle error', () => { ... });  ❌
```

✅ **All tests enabled**:
```tsx
it('should handle error', () => { ... });  ✅
```

---

❌ **No missing accessibility tests**:
```tsx
// Test file without axe check  ❌
describe('Button', () => {
  it('renders', () => { ... });
});
```

✅ **Include accessibility**:
```tsx
import { axe } from 'vitest-axe';

describe('Button', () => {
  it('has no a11y violations', async () => {
    const { container } = render(<Button>Click</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

### Documentation

❌ **No missing Storybook stories**:
```tsx
// Component exists but no .stories.tsx file  ❌
```

✅ **Every component has a story**:
```tsx
// component.stories.tsx with all variants documented  ✅
```

---

❌ **No outdated Sprint_plan.csv**:
```csv
IFC-090,Core CRM,Contact 360,...,Planned  ❌ (if actually completed)
```

✅ **Update status immediately**:
```csv
IFC-090,Core CRM,Contact 360,...,Completed  ✅
```

---

## 🤖 SUB-AGENT USAGE

### When to Use Sub-Agents

Use the `Task` tool to spawn specialized sub-agents for:

1. **Code Search** (Explore agent):
   ```
   "Find all components using hardcoded slate-900 color"
   "Locate widget implementations in dashboard folder"
   ```

2. **Small Validation Tasks**:
   ```
   "Run typecheck on packages/ui and report errors"
   "Generate test coverage report for new component"
   ```

3. **Documentation Updates**:
   ```
   "Update Sprint_plan.csv status for IFC-090 to Completed"
   "Generate attestation.json for IFC-090 with SHA256 hashes"
   ```

4. **Pattern Analysis**:
   ```
   "Analyze all Button usage in apps/web for inconsistencies"
   "Check if all forms use React Hook Form pattern"
   ```

### Sub-Agent Best Practices

✅ **Clear, specific tasks**:
```
Good: "Find all .tsx files in apps/web/src/components/dashboard/widgets/ that import Card from @intelliflow/ui"
Bad: "Check widgets"
```

✅ **Validation-focused**:
```
Good: "Run pnpm typecheck and return only error count and first 3 errors"
Bad: "Check if code is good"
```

✅ **One task per agent**:
```
Good: Spawn 3 agents for typecheck, test, build
Bad: Single agent for "check everything"
```

---

## 📋 WORKFLOW CHECKLIST

### Before Starting

- [ ] Read `docs/design/UI_CONSOLIDATION_PLAN.md`
- [ ] Check `Sprint_plan.csv` for task details (Task ID, Dependencies, Pre-requisites)
- [ ] Review mockup if exists (check `Pre-requisites` column for `DESIGN:` prefix)
- [ ] Verify dependencies are completed
- [ ] Check existing component patterns in `packages/ui/src/components/`

### During Development

- [ ] Use correct color approach: CSS variables for semantic, slate for hierarchy
- [ ] Import from `@intelliflow/ui` (no direct Radix imports)
- [ ] Follow existing component patterns (CVA for variants, cn() for classes)
- [ ] Use Material Symbols Outlined for icons
- [ ] Write tests as you code (TDD approach)
- [ ] Run `pnpm typecheck` frequently
- [ ] No `console.log`, `TODO`, or placeholder code

### After Implementation

- [ ] Run full validation suite:
  ```bash
  pnpm typecheck           # Must pass
  pnpm test                # Must pass with 90%+ coverage
  pnpm lint                # No errors
  pnpm build               # Must succeed
  ```
- [ ] Create Storybook story (if new component)
- [ ] Update `Sprint_plan.csv` status to "Completed"
- [ ] Run metrics sync: `npx tsx apps/project-tracker/scripts/sync-metrics.ts`
- [ ] Create attestation files in `artifacts/attestations/[TASK-ID]/`
- [ ] Verify no scattered code (check file locations)
- [ ] Run accessibility audit with axe DevTools
- [ ] Test in both light and dark modes

### Validation Commands

```bash
# Full validation pipeline
pnpm typecheck && pnpm test && pnpm lint && pnpm build

# Component-specific
pnpm --filter @intelliflow/ui typecheck
pnpm --filter @intelliflow/ui test --coverage
pnpm --filter @intelliflow/ui build

# App-specific
pnpm --filter web typecheck
pnpm --filter web build
```

---

## 🎯 TASK EXECUTION TEMPLATE

When you receive a task, follow this structure:

### 1. Planning Phase

```markdown
## Task: [TASK-ID] - [Description]

### Context Review
- [ ] Read task from Sprint_plan.csv
- [ ] Dependencies: [list prerequisite tasks]
- [ ] Design mockup: [path if exists]
- [ ] Related components: [existing components to reference]

### Implementation Plan
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Validation Criteria
- TypeCheck: Pass
- Tests: >90% coverage
- Build: Success
- Accessibility: WCAG 2.1 AA
```

### 2. Implementation Phase

- Write code following patterns
- Use CSS variables for colors
- Import from `@intelliflow/ui`
- Write tests alongside code
- Run validation frequently

### 3. Documentation Phase

- Create Storybook story
- Update Sprint_plan.csv
- Generate attestation
- Run metrics sync

### 4. Validation Phase

```bash
# Run full suite
pnpm typecheck && pnpm test && pnpm build
```

### 5. Completion Report

```markdown
## Completion Report: [TASK-ID]

### Files Created/Modified
- `packages/ui/src/components/new-component.tsx` (245 lines)
- `packages/ui/__tests__/new-component.test.tsx` (180 lines, 95% coverage)
- `packages/ui/src/components/new-component.stories.tsx` (85 lines)

### Validations
- ✅ TypeCheck: 0 errors
- ✅ Tests: 95% coverage (45/47 lines)
- ✅ Build: Success
- ✅ Accessibility: 0 violations
- ✅ Dark mode: Verified

### Sprint_plan.csv
- Updated status: Planned → Completed
- Artifacts verified: All created

### Attestation
- Created: `artifacts/attestations/IFC-XXX/attestation.json`
- SHA256 hashes: Verified
- Validation results: All passed
```

---

## 🔧 COMMON TASKS & PATTERNS

### Creating a New Component

1. **Create component file**: `packages/ui/src/components/component-name.tsx`
2. **Export in index**: Add to `packages/ui/src/components/index.ts`
3. **Create test**: `packages/ui/__tests__/component-name.test.tsx`
4. **Create story**: `packages/ui/src/components/component-name.stories.tsx`
5. **Validate**: Run typecheck, test, build
6. **Document**: Update Sprint_plan.csv, create attestation

### Color Patterns Reference

**Container with border (cards, tables, panels)**:
```tsx
<div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
```

**Subtle background (filter bars, headers)**:
```tsx
<div className="bg-slate-50 dark:bg-slate-800/50">
```

**Interactive row with hover**:
```tsx
<tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
```

**Primary action button**:
```tsx
<button className="bg-primary text-primary-foreground hover:bg-primary/90">
```

**Status badges** (use semantic CSS variables):
```tsx
<span className="bg-success/10 text-success">Active</span>
<span className="bg-destructive/10 text-destructive">Failed</span>
```

### Integrating Widget with Layout Builder

**Old pattern** (hardcoded):
```tsx
export function RevenueWidget() {
  return <Card>$125,000</Card>;
}
```

**New pattern** (using Widget interface):
```tsx
import { Widget, WidgetProps } from '@intelliflow/ui';

interface RevenueConfig {
  period: 'day' | 'week' | 'month';
}

export function RevenueWidget({ config }: WidgetProps<RevenueConfig>) {
  const { data } = useRevenueData(config.period);

  return (
    <Widget
      title="Revenue"
      icon="payments"
      isLoading={!data}
    >
      <p className="text-2xl font-bold text-foreground">
        ${data?.revenue.toLocaleString()}
      </p>
    </Widget>
  );
}
```

### Adding Design Mockup Reference

**Sprint_plan.csv entry**:
```csv
Task ID,Section,Description,...,Pre-requisites
IFC-090,Core CRM,Contact 360 Page,...,DESIGN:docs/design/mockups/contact-360-view.png;FILE:...
```

**Implementation**:
1. Open mockup: `docs/design/mockups/contact-360-view.png`
2. Match layout, spacing, colors, typography
3. Verify all components from mockup are present
4. Test responsive behavior

### Sidebar Pattern (MANDATORY)

All pages with sidebar navigation **MUST** use the unified `AppSidebar` pattern.

**Location**: `apps/web/src/components/sidebar/`

**Components**:
- `AppSidebar` - Collapsible sidebar with expand-on-hover
- `SidebarProvider` - Context for sidebar state (pinned/expanded)
- `SidebarInset` - Content wrapper that adjusts for sidebar width
- `SidebarTrigger` - Mobile menu toggle button
- `SidebarConfig` - Type for sidebar configuration

**✅ CORRECT Pattern** (use for ALL modules):
```tsx
'use client';

import {
  SidebarProvider,
  AppSidebar,
  SidebarInset,
  SidebarTrigger,
  leadsSidebarConfig,  // Import the module's config
} from '@/components/sidebar';

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar config={leadsSidebarConfig} />
        <SidebarInset>
          <main className="flex flex-1 flex-col h-full min-w-0 overflow-hidden bg-background">
            <div className="flex items-center gap-2 px-6 py-3 border-b border-border lg:hidden">
              <SidebarTrigger />
              <span className="text-sm text-muted-foreground">Leads</span>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-3 md:p-4">
              {children}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
```

**❌ NEVER create custom sidebars**:
```tsx
// ❌ DON'T create custom sidebar components per module
export function NotificationSidebar() { ... }  // WRONG
export function GovernanceSidebar() { ... }    // WRONG
export function SettingsSidebar() { ... }      // WRONG
```

**Creating a new module sidebar config**:

1. Create config file: `apps/web/src/components/sidebar/configs/[module].ts`
2. Use standardized icons from `icon-reference.ts`
3. Export from `configs/index.ts`
4. Use CSS variables for colors (`text-primary`, `text-destructive`, etc.)

**Config template**:
```tsx
import type { SidebarConfig } from '../sidebar-types';
import { MODULE_ICONS, VIEW_ICONS } from '../icon-reference';

export const moduleSidebarConfig: SidebarConfig = {
  moduleId: 'module-name',
  moduleTitle: 'Module Title',
  moduleIcon: MODULE_ICONS.moduleName,
  settingsHref: '/settings/module',
  showSettings: true,
  sections: [
    {
      id: 'views',
      title: 'Views',
      items: [
        { id: 'all', label: 'All Items', icon: VIEW_ICONS.all, href: '/module' },
        { id: 'my', label: 'My Items', icon: VIEW_ICONS.my, href: '/module?view=my' },
      ],
    },
  ],
};
```

**Available sidebar configs**:
- `leadsSidebarConfig`
- `contactsSidebarConfig`
- `documentsSidebarConfig`
- `dealsSidebarConfig`
- `ticketsSidebarConfig`
- `analyticsSidebarConfig`
- `agentApprovalsSidebarConfig`
- `notificationsSidebarConfig`
- `governanceSidebarConfig`
- `settingsSidebarConfig`

---

### PageHeader Pattern (MANDATORY)

All pages **MUST** use the unified `PageHeader` component for consistent page titles, breadcrumbs, and actions.

**Location**: `apps/web/src/components/shared/page-header.tsx`

**Components**:
- `PageHeader` - Main page header with title, breadcrumbs, description, and actions
- `Breadcrumbs` - Standalone breadcrumb navigation component

**✅ CORRECT Pattern**:
```tsx
import { PageHeader } from '@/components/shared';

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Leads', href: '/leads' },
          { label: 'All Leads' },
        ]}
        title="All Leads"
        description="Manage and track your sales leads"
        actions={[
          {
            label: 'Export',
            icon: 'download',
            variant: 'secondary',
            onClick: handleExport,
            hideOnMobile: true,
          },
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

**❌ NEVER create custom page headers**:
```tsx
// ❌ DON'T create inline headers
<div className="flex justify-between">
  <div>
    <h1>All Leads</h1>
    <p>Description</p>
  </div>
  <button>Add</button>
</div>
```

**PageHeader Props**:
| Prop | Type | Description |
|------|------|-------------|
| `breadcrumbs` | `BreadcrumbItem[]` | Navigation breadcrumbs |
| `title` | `string` | Page title (h1) |
| `description` | `string?` | Optional description |
| `actions` | `PageAction[]` | Action buttons (primary/secondary) |
| `children` | `ReactNode?` | Additional content below description |

**PageAction Props**:
| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Button text |
| `icon` | `string?` | Material Symbols icon name |
| `variant` | `'primary' \| 'secondary'` | Button style |
| `onClick` | `function?` | Click handler |
| `href` | `string?` | Link destination |
| `hideOnMobile` | `boolean?` | Hide label on small screens |
| `disabled` | `boolean?` | Disabled state |
| `loading` | `boolean?` | Loading state |

---

## 📦 DEPENDENCY VERSIONS (LOCKED)

**Do not upgrade** without team approval:

```json
{
  "next": "16.0.10",
  "react": "19.0.0",
  "typescript": "5.7.2",
  "tailwindcss": "3.4.17",
  "@radix-ui/*": "latest",
  "vitest": "2.1.8",
  "@storybook/*": "8.4.7"
}
```

---

## 🆘 TROUBLESHOOTING

### TypeScript Errors

```bash
# Clear cache and rebuild
rm -rf node_modules/.cache
pnpm --filter @intelliflow/ui run build
pnpm typecheck
```

### Test Failures

```bash
# Run with verbose output
pnpm --filter @intelliflow/ui test --run --reporter=verbose

# Check specific test
pnpm --filter @intelliflow/ui test button.test.tsx
```

### Build Errors

```bash
# Clean and rebuild
rm -rf packages/ui/dist
pnpm --filter @intelliflow/ui run build
```

### Storybook Issues

```bash
# Clear cache
rm -rf node_modules/.cache/storybook
pnpm --filter @intelliflow/ui storybook
```

---

## 📞 GETTING HELP

1. **Check existing patterns**: Look at similar components in `packages/ui/src/components/`
2. **Read consolidation plan**: `docs/design/UI_CONSOLIDATION_PLAN.md`
3. **Review style guide**: `docs/company/brand/style-guide.md`
4. **Use sub-agents**: Spawn Explore agent to search codebase
5. **Validate early**: Run typecheck/test frequently to catch issues

---

## ✅ SESSION SUCCESS CRITERIA

At the end of this session, you should have:

- [ ] **Zero errors**: TypeCheck, tests, build all passing
- [ ] **90%+ test coverage**: All new code tested
- [ ] **Documentation complete**: Storybook story, Sprint_plan.csv updated, attestation created
- [ ] **Consistent patterns**: CSS variables, @intelliflow/ui imports, Material Symbols icons
- [ ] **No drift**: Code in correct locations, following existing patterns
- [ ] **Production-ready**: No TODOs, placeholders, or console.logs
- [ ] **Integrated**: Works with existing codebase, no scattered code
- [ ] **Tracked**: Sprint_plan.csv and attestations updated

---

## 🚀 READY TO START

You now have all context needed for consistent UI development. Remember:

1. **Read `UI_CONSOLIDATION_PLAN.md` first**
2. **Check `Sprint_plan.csv` for your task**
3. **Use correct colors**: CSS variables for semantic, slate for hierarchy
4. **Follow existing patterns**
5. **Write tests as you code**
6. **Document everything**
7. **Update Sprint_plan.csv and attestations**
8. **No errors, no placeholders, no drift**

Let's build production-grade UI!
