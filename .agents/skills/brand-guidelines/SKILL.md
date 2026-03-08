---
name: brand-guidelines
description: Applies IntelliFlow CRM's official brand colors and typography to any sort of artifact that may benefit from having the IntelliFlow look-and-feel. Use it when brand colors or style guidelines, visual formatting, or company design standards apply to the CRM project.
license: Complete terms in LICENSE.txt
---

# IntelliFlow CRM Brand Styling

## Overview

To access IntelliFlow CRM's official brand identity and style resources, use this skill.

**Keywords**: branding, corporate identity, visual identity, post-processing, styling, brand colors, typography, IntelliFlow brand, CRM design, visual formatting

## Brand Guidelines

### Design Tokens (from DESIGN_SYSTEM_LLM_INDEX.md)

**Primary Colors:**
```json
{
  "primary": "#137fec",
  "primary-hover": "#0e6ac7",
  "background-light": "#f6f7f8",
  "background-dark": "#101922",
  "surface-light": "#ffffff",
  "surface-dark": "#1e2936",
  "border-light": "#e2e8f0",
  "border-dark": "#334155"
}
```

**CSS Variables (from globals.css):**
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

/* Dark mode */
.dark {
  --background: #101922;
  --foreground: #f8fafc;
  --primary: #137fec;            /* Same brand blue */
  --card: #1e2936;
  --border: #334155;
}
```

### Two Color Approaches (MANDATORY)

1. **CSS Variables** - For semantic colors (primary, destructive, success):
```tsx
<div className="text-primary">                    // Brand blue
<div className="bg-primary text-primary-foreground">  // Primary buttons
<div className="text-destructive">                // Errors, danger
<div className="bg-success text-white">           // Success states
```

2. **Explicit Slate Colors** - For visual hierarchy and layering:
```tsx
// Containers
<div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
// Subtle backgrounds
<div className="bg-slate-50 dark:bg-slate-800/50">
// Text hierarchy
<h1 className="text-slate-900 dark:text-white">       // Primary text
<p className="text-slate-600 dark:text-slate-300">    // Body text
<span className="text-slate-500 dark:text-slate-400"> // Secondary text
```

### Typography

- **Font Family**: Inter (fallback: system-ui, sans-serif)
- **Scale**: Base 16px
  - xs: 0.75rem (12px), sm: 0.875rem (14px), base: 1rem (16px)
  - lg: 1.125rem (18px), xl: 1.25rem (20px), 2xl: 1.5rem (24px)

### Icon System

**MANDATORY**: Use Material Symbols Outlined (NOT Lucide React)
```tsx
<span className="material-symbols-outlined text-xl" aria-hidden="true">
  check_circle
</span>
```

### Logo

**Type**: Material Icon + Wordmark
**Icon**: Material Symbol "grid_view"
```html
<div class="flex items-center gap-3">
  <div class="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
    <span class="material-symbols-outlined text-white text-2xl">grid_view</span>
  </div>
  <div class="text-2xl font-bold">IntelliFlow CRM</div>
</div>
```

### Spacing

- **Base Unit**: 4px (0.25rem)
- **Scale**: 1: 4px, 2: 8px, 3: 12px, 4: 16px, 6: 24px, 8: 32px, 12: 48px

### Border Radius

- **Default**: 0.25rem (4px)
- **lg**: 0.5rem (8px)
- **xl**: 0.75rem (12px)
- **2xl**: 1rem (16px)

## Component Import Pattern

**CORRECT:**
```tsx
import { Card, Button, Input, Toast } from '@intelliflow/ui';
import { cn } from '@intelliflow/ui';
```

**NEVER:**
```tsx
import { Dialog } from '@radix-ui/react-dialog';  // Bypass encapsulation
import { Button } from '@/components/ui/button';  // Wrong path
```

## Source Documents

- `docs/company/brand/DESIGN_SYSTEM_LLM_INDEX.md` - Machine-readable reference
- `docs/design/UI_DEVELOPMENT_PROMPT.md` - Development session prompt
- `apps/web/src/app/globals.css` - CSS variables
