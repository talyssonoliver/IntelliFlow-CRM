# IntelliFlow CRM UI - Quick Reference Card

> **Purpose**: Quick lookup for common patterns and standards
> **Version**: 1.0
> **Last Updated**: 2025-12-31

---

## 🎨 Color System (CSS Variables ONLY)

### ❌ NEVER USE

```tsx
className="text-slate-900 dark:text-white"          // Direct Tailwind
className="bg-ds-primary"                            // Custom token
className={`bg-blue-${100 + i * 100}`}               // Dynamic class
```

### ✅ ALWAYS USE

```tsx
className="text-foreground"                          // Auto theme-aware
className="bg-primary"                               // Brand color
className="bg-card text-card-foreground"             // Card styling
className="border-border"                            // Borders
className="bg-muted text-muted-foreground"           // Subtle backgrounds
className="bg-destructive text-destructive-foreground" // Errors
className="bg-primary" style={{ opacity: 0.5 }}     // Dynamic opacity
```

### Available Variables

| Variable | Light Mode | Dark Mode | Usage |
|----------|-----------|-----------|-------|
| `--background` | #f6f7f8 | #101922 | Page background |
| `--foreground` | #0f172a | #f8fafc | Primary text |
| `--primary` | #137fec | #137fec | Brand blue (same) |
| `--primary-foreground` | #ffffff | #ffffff | Text on primary |
| `--card` | #ffffff | #1e2936 | Card backgrounds |
| `--card-foreground` | #0f172a | #f8fafc | Text on cards |
| `--border` | #e2e8f0 | #334155 | Borders |
| `--muted` | #f1f5f9 | #1e293b | Subtle bg |
| `--accent` | #7cc4ff | #7cc4ff | Highlights |
| `--destructive` | #ef4444 | #ef4444 | Errors |
| `--success` | #10b981 | #10b981 | Success |

---

## 📦 Component Imports

### ✅ CORRECT

```tsx
import { Card, Button, Input, Toast } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';
```

### ❌ NEVER

```tsx
import { Dialog } from '@radix-ui/react-dialog';   // ❌ Bypass
import { Button } from '@/components/ui/button';   // ❌ Wrong path
```

---

## 🎯 Icon Pattern

### ✅ CORRECT (Material Symbols Outlined)

```tsx
<span className="material-symbols-outlined text-xl" aria-hidden="true">
  check_circle
</span>
```

### ❌ AVOID (Lucide - being phased out)

```tsx
import { CheckCircle } from 'lucide-react';  // ❌
```

---

## 🧪 Testing Checklist

```bash
# Before committing
pnpm typecheck          # ✅ Must pass
pnpm test               # ✅ 90%+ coverage
pnpm lint               # ✅ No errors
pnpm build              # ✅ Must succeed
```

### Test Template

```tsx
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName>Content</ComponentName>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ComponentName>Content</ComponentName>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

---

## 📚 Storybook Story Template

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentName } from './component-name';

const meta: Meta<typeof ComponentName> = {
  title: 'Components/ComponentName',
  component: ComponentName,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ComponentName>;

export const Default: Story = {
  args: {
    children: 'Content',
  },
};
```

---

## 📋 Widget Pattern

### ❌ OLD (Hardcoded)

```tsx
export function RevenueWidget() {
  const revenue = 125000;  // Hardcoded!
  return <Card>{revenue}</Card>;
}
```

### ✅ NEW (Layout Builder)

```tsx
import { Widget, WidgetProps } from '@intelliflow/ui';

export function RevenueWidget({ config }: WidgetProps<RevenueConfig>) {
  const { data } = useRevenueData(config.period);

  return (
    <Widget title="Revenue" icon="payments">
      <p className="text-2xl font-bold text-foreground">
        ${data?.revenue.toLocaleString()}
      </p>
    </Widget>
  );
}
```

---

## 📝 Documentation Requirements

### After Implementation

1. **Update Sprint_plan.csv**: `Planned` → `Completed`
2. **Run metrics sync**: `npx tsx apps/project-tracker/scripts/sync-metrics.ts`
3. **Create attestation**: `artifacts/attestations/[TASK-ID]/attestation.json`
4. **Add Storybook story**: If new component
5. **Verify tests**: 90%+ coverage

---

## 🚫 Common Mistakes

| ❌ Don't | ✅ Do |
|---------|------|
| `console.log()` | Remove or use proper logging |
| `// TODO:` | Complete implementation |
| `@ts-ignore` | Fix the type error |
| `any` types | Use proper TypeScript types |
| Hardcoded colors | Use CSS variables |
| Skip tests | Write tests (90%+ coverage) |
| Skip Storybook | Add story for component |
| Forget Sprint_plan.csv | Update status |

---

## 🔧 Validation Commands

### Full Pipeline

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm build
```

### Per Package

```bash
pnpm --filter @intelliflow/ui typecheck
pnpm --filter @intelliflow/ui test --coverage
pnpm --filter @intelliflow/ui build
```

### Specific App

```bash
pnpm --filter web typecheck
pnpm --filter web build
pnpm --filter api test
```

---

## 📁 File Locations

| What | Where |
|------|-------|
| Reusable components | `packages/ui/src/components/` |
| Component tests | `packages/ui/__tests__/` |
| Storybook stories | `packages/ui/src/components/*.stories.tsx` |
| App-specific components | `apps/web/src/components/` |
| Design tokens | `docs/company/brand/*.tokens.json` |
| Style guide | `docs/company/brand/style-guide.md` |
| Design mockups | `docs/design/mockups/` |
| Sprint plan | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` |
| Attestations | `artifacts/attestations/[TASK-ID]/` |

---

## 🎯 Common Patterns

### Form with Validation

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
});

function MyForm() {
  const form = useForm({
    resolver: zodResolver(schema),
  });

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

### Toast Notification

```tsx
import { useState } from 'react';
import { Toast, ToastProvider, ToastViewport } from '@intelliflow/ui';

const [toast, setToast] = useState({
  open: false,
  variant: 'success',
  title: '',
  description: '',
});

// Show toast
setToast({
  open: true,
  variant: 'success',
  title: 'Success!',
  description: 'Operation completed.',
});

// In JSX
<ToastProvider>
  <Toast open={toast.open} onOpenChange={...} variant={toast.variant}>
    ...
  </Toast>
  <ToastViewport />
</ToastProvider>
```

### Button Variants

```tsx
import { Button } from '@intelliflow/ui';

<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
```

---

## 📊 Success Metrics

At session end, you should have:

- ✅ Zero TypeScript errors
- ✅ 90%+ test coverage
- ✅ All tests passing
- ✅ Build succeeds
- ✅ Storybook story created (if new component)
- ✅ Sprint_plan.csv updated
- ✅ Attestation created
- ✅ CSS variables used (no hardcoded colors)
- ✅ No TODOs or placeholders
- ✅ Accessibility verified (axe tests passing)

---

## 🔗 Quick Links

- **Full Prompt**: `docs/design/UI_DEVELOPMENT_PROMPT.md`
- **Consolidation Plan**: `docs/design/UI_CONSOLIDATION_PLAN.md`
- **Style Guide**: `docs/company/brand/style-guide.md`
- **Page Registry**: `docs/design/page-registry.md`
- **Sitemap**: `docs/design/sitemap.md`
- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
