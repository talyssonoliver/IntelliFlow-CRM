# Theme Reference Specification

**Version:** 1.0.0 **Last Updated:** 2025-12-20 **Status:** Active

## Overview

This document provides a comprehensive reference for the IntelliFlow CRM theme
system. It explains how to use design tokens in components, implement dark mode,
and follow best practices for maintaining visual consistency.

## Table of Contents

1. [Theme Architecture](#theme-architecture)
2. [Using Design Tokens](#using-design-tokens)
3. [Dark Mode Implementation](#dark-mode-implementation)
4. [Component Patterns](#component-patterns)
5. [Best Practices](#best-practices)
6. [Common Patterns](#common-patterns)
7. [Migration Guide](#migration-guide)
8. [Troubleshooting](#troubleshooting)

## Theme Architecture

### System Overview

```
Brand Tokens (HEX, px)
        ↓
CSS Variables (HSL, rem)
        ↓
Tailwind Utilities (semantic classes)
        ↓
React Components (styled with Tailwind)
```

### File Structure

```
intelliFlow-CRM/
├── docs/company/brand/          # Brand tokens (source of truth)
│   ├── palette.tokens.json      # Colors in HEX
│   ├── typography.tokens.json   # Font families, sizes
│   └── spacing.tokens.json      # Spacing scale
│
├── apps/web/
│   ├── tailwind.config.ts       # Tailwind configuration
│   └── src/app/globals.css      # CSS variables (HSL)
│
└── packages/ui/src/components/  # Themed components
```

### Three-Tier Token System

**Tier 1: Brand Tokens (Design)**

- Format: HEX colors, pixel values
- Location: `docs/company/brand/*.tokens.json`
- Purpose: Design system source of truth
- Example: `"color.brand.primary": "#2563EB"`

**Tier 2: CSS Variables (Implementation)**

- Format: HSL colors (without `hsl()` wrapper)
- Location: `apps/web/src/app/globals.css`
- Purpose: Runtime theme values with dark mode support
- Example: `--primary: 221.2 83.2% 53.3%;`

**Tier 3: Tailwind Utilities (Usage)**

- Format: Semantic class names
- Location: `apps/web/tailwind.config.ts` + components
- Purpose: Developer-friendly classes for components
- Example: `className="bg-primary text-primary-foreground"`

## Using Design Tokens

### Color Tokens

#### Semantic Colors

Use semantic color names that describe purpose, not appearance:

```tsx
// ✅ GOOD - Semantic names
<Button className="bg-primary text-primary-foreground">
  Primary Action
</Button>

<div className="bg-destructive text-destructive-foreground">
  Error message
</div>

// ❌ BAD - Color names
<Button className="bg-blue-600 text-white">
  Primary Action
</Button>
```

#### Available Semantic Colors

| Token         | Light Mode | Dark Mode    | Usage                        |
| ------------- | ---------- | ------------ | ---------------------------- |
| `background`  | White      | Dark slate   | Page backgrounds             |
| `foreground`  | Dark slate | Light gray   | Primary text                 |
| `primary`     | Blue       | Lighter blue | Primary actions, links       |
| `secondary`   | Light gray | Dark gray    | Secondary surfaces           |
| `muted`       | Light gray | Dark gray    | Muted backgrounds            |
| `accent`      | Light gray | Dark gray    | Subtle accents, hover states |
| `destructive` | Red        | Dark red     | Destructive actions, errors  |
| `border`      | Light gray | Dark gray    | Borders, dividers            |
| `input`       | Light gray | Dark gray    | Input borders                |
| `ring`        | Blue       | Blue         | Focus rings                  |

#### Color with Foreground

Always use foreground variants to ensure proper contrast:

```tsx
// ✅ GOOD - Background + foreground pair
<div className="bg-primary text-primary-foreground">
  High contrast text
</div>

// ❌ BAD - No foreground specified
<div className="bg-primary">
  Text might not be readable
</div>
```

### Typography Tokens

#### Font Families

```tsx
// Sans-serif (default)
<p className="font-sans">
  Body text using Inter
</p>

// Monospace
<code className="font-mono">
  const code = "example";
</code>
```

#### Font Sizes

```tsx
<p className="text-xs">Extra small text (12px)</p>
<p className="text-sm">Small text (14px)</p>
<p className="text-base">Normal text (16px) - default</p>
<p className="text-lg">Large text (18px)</p>
<p className="text-xl">Extra large text (20px)</p>
<p className="text-2xl">Heading text (24px)</p>
```

#### Line Heights

```tsx
<h1 className="leading-tight">
  Tight heading (1.2)
</h1>

<p className="leading-normal">
  Normal body text (1.5)
</p>

<article className="leading-relaxed">
  Long-form content (1.7)
</article>
```

### Spacing Tokens

Use the 4px-based spacing scale:

```tsx
// Padding
<div className="p-4">16px padding</div>
<div className="px-6 py-3">24px horizontal, 12px vertical</div>

// Margin
<div className="mt-8">32px top margin</div>
<div className="mb-4">16px bottom margin</div>

// Gap (Flexbox/Grid)
<div className="flex gap-2">8px gap</div>
<div className="grid gap-6">24px gap</div>
```

**Common Spacing Values:**

- `0` = 0px
- `1` = 4px
- `2` = 8px
- `3` = 12px
- `4` = 16px (most common)
- `6` = 24px (common for cards)
- `8` = 32px (section spacing)

### Border Radius

```tsx
// Default radius (8px)
<div className="rounded-lg">Large radius</div>

// Medium radius (6px)
<div className="rounded-md">Medium radius</div>

// Small radius (4px)
<div className="rounded-sm">Small radius</div>
```

## Dark Mode Implementation

### Overview

The theme system uses **class-based dark mode**. A `.dark` class on the root
element switches all CSS variables to their dark mode values.

### Enabling Dark Mode

**Method 1: Manual Toggle**

```tsx
'use client';

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState(false);

  const toggleDarkMode = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  return (
    <button onClick={toggleDarkMode}>{isDark ? '☀️ Light' : '🌙 Dark'}</button>
  );
}
```

**Method 2: System Preference (Recommended)**

```tsx
'use client';

import { useEffect, useState } from 'react';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Check system preference
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (isDark) {
      document.documentElement.classList.add('dark');
    }

    // Listen for changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return <>{children}</>;
}
```

### Dark Mode CSS Variables

All color tokens have dark mode variants:

```css
/* Light mode (default) */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  /* ... */
}

/* Dark mode */
.dark {
  --background: 222.2 84% 4.9%; /* Inverted */
  --foreground: 210 40% 98%; /* Inverted */
  --primary: 217.2 91.2% 59.8%; /* Adjusted for dark backgrounds */
  /* ... */
}
```

### Dark Mode Rules

1. **Automatic Theme Switching**
   - Components automatically adapt when `.dark` class is present
   - No conditional logic needed in components
   - Tailwind classes remain the same

2. **Color Adjustments**
   - Colors are adjusted for dark backgrounds (not just inverted)
   - Primary colors are slightly lighter in dark mode for better visibility
   - Destructive colors are darker in dark mode to reduce harshness

3. **Testing Dark Mode**

   ```bash
   # Add class to test
   document.documentElement.classList.add('dark')

   # Remove class to test light mode
   document.documentElement.classList.remove('dark')
   ```

### Dark Mode Best Practices

```tsx
// ✅ GOOD - Uses semantic tokens (auto-adapts)
<div className="bg-background text-foreground">
  Content that works in both themes
</div>

// ❌ BAD - Hardcoded colors (no dark mode)
<div className="bg-white text-black">
  Only works in light mode
</div>

// ✅ GOOD - Semantic button (auto-adapts)
<Button variant="primary">
  Works in both themes
</Button>

// ❌ BAD - Manual dark mode logic
<Button className={isDark ? "bg-blue-400" : "bg-blue-600"}>
  Unnecessary complexity
</Button>
```

## Component Patterns

### Button Component

```tsx
import { Button } from '@/components/ui/button';

// Primary action
<Button variant="default">
  Save Changes
</Button>

// Destructive action
<Button variant="destructive">
  Delete Account
</Button>

// Secondary action
<Button variant="secondary">
  Cancel
</Button>

// Outlined button
<Button variant="outline">
  Learn More
</Button>

// Ghost button (subtle)
<Button variant="ghost">
  Skip
</Button>

// Link-style button
<Button variant="link">
  Read documentation
</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon">🔍</Button>
```

### Card Component

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description with muted text</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Card content area</p>
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>;
```

### Form Components

```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

<div className="space-y-2">
  <Label htmlFor="email">Email</Label>
  <Input id="email" type="email" placeholder="you@example.com" />
</div>;
```

### Table Component

```tsx
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>John Doe</TableCell>
      <TableCell>Active</TableCell>
    </TableRow>
  </TableBody>
</Table>;
```

## Best Practices

### 1. Always Use Semantic Tokens

```tsx
// ✅ GOOD
<div className="bg-primary text-primary-foreground">
<p className="text-muted-foreground">
<Button variant="destructive">

// ❌ BAD
<div className="bg-blue-600 text-white">
<p className="text-gray-500">
<Button className="bg-red-500">
```

### 2. Include Foreground Variants

```tsx
// ✅ GOOD - Ensures readable contrast
<div className="bg-card text-card-foreground">
  Card content
</div>

// ❌ BAD - May have poor contrast
<div className="bg-card">
  Card content
</div>
```

### 3. Use Consistent Spacing

```tsx
// ✅ GOOD - Uses spacing scale
<div className="p-6 space-y-4">
  <div className="mb-8">

// ❌ BAD - Arbitrary values
<div className="p-[23px]">
  <div className="mb-[13px]">
```

### 4. Leverage Component Variants

```tsx
// ✅ GOOD - Uses built-in variants
<Button variant="destructive" size="lg">

// ❌ BAD - Custom styling
<Button className="bg-red-500 px-8 py-4">
```

### 5. Avoid Hardcoded Colors

```tsx
// ✅ GOOD
<div className="border border-border">

// ❌ BAD
<div className="border border-gray-200">
<div style={{ borderColor: '#E5E7EB' }}>
```

### 6. Use Opacity Modifiers

```tsx
// ✅ GOOD - Maintains theme colors
<div className="bg-primary/90">      /* 90% opacity */
<div className="hover:bg-primary/80"> /* 80% on hover */

// ❌ BAD - Breaks dark mode
<div className="bg-blue-500/90">
```

### 7. Test in Both Themes

Always test components in both light and dark modes:

```tsx
// Add to development tools
<div className="fixed bottom-4 right-4 z-50">
  <Button
    variant="outline"
    size="sm"
    onClick={() => document.documentElement.classList.toggle('dark')}
  >
    Toggle Theme
  </Button>
</div>
```

## Common Patterns

### Page Layout

```tsx
export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-6">
          <h1 className="text-2xl font-semibold">Page Title</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Section Title</CardTitle>
            <CardDescription>Section description</CardDescription>
          </CardHeader>
          <CardContent>{/* Content */}</CardContent>
        </Card>
      </main>
    </div>
  );
}
```

### Form Layout

```tsx
<form className="space-y-6">
  <div className="space-y-2">
    <Label htmlFor="name">Name</Label>
    <Input id="name" placeholder="Enter name" />
  </div>

  <div className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" placeholder="you@example.com" />
  </div>

  <div className="flex gap-4">
    <Button type="submit">Submit</Button>
    <Button type="button" variant="outline">
      Cancel
    </Button>
  </div>
</form>
```

### Status Badge

```tsx
// Create a status badge component
export function StatusBadge({
  status,
}: {
  status: 'success' | 'error' | 'pending';
}) {
  const variants = {
    success:
      'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    error: 'bg-destructive/10 text-destructive',
    pending: 'bg-muted text-muted-foreground',
  };

  return (
    <span
      className={`inline-flex px-2 py-1 text-xs rounded-md ${variants[status]}`}
    >
      {status}
    </span>
  );
}
```

### Loading State

```tsx
<div className="flex items-center justify-center p-8">
  <div className="text-center space-y-4">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
    <p className="text-muted-foreground">Loading...</p>
  </div>
</div>
```

### Empty State

```tsx
<div className="flex flex-col items-center justify-center p-12 text-center">
  <div className="rounded-full bg-muted p-4 mb-4">
    <Icon className="h-8 w-8 text-muted-foreground" />
  </div>
  <h3 className="text-lg font-semibold mb-2">No items found</h3>
  <p className="text-muted-foreground mb-4">
    Get started by creating your first item.
  </p>
  <Button>Create Item</Button>
</div>
```

## Migration Guide

### From Hardcoded Colors

**Before:**

```tsx
<div className="bg-white dark:bg-slate-900">
  <p className="text-gray-900 dark:text-gray-100">
```

**After:**

```tsx
<div className="bg-background">
  <p className="text-foreground">
```

### From Color Names

**Before:**

```tsx
<Button className="bg-blue-600 hover:bg-blue-700 text-white">

<div className="bg-red-50 text-red-900 border border-red-200">
```

**After:**

```tsx
<Button variant="default">

<div className="bg-destructive/10 text-destructive border border-destructive/20">
```

### From Arbitrary Values

**Before:**

```tsx
<div className="p-[23px] mb-[17px]">
```

**After:**

```tsx
<div className="p-6 mb-4">
```

## Troubleshooting

### Issue: Dark mode not working

**Solution:**

1. Ensure `.dark` class is on `<html>` or `<body>` element
2. Check Tailwind config has `darkMode: 'class'`
3. Verify CSS variables exist in both `:root` and `.dark` selectors

### Issue: Colors look wrong in dark mode

**Solution:**

1. Use semantic tokens, not hardcoded colors
2. Include foreground variants: `bg-primary text-primary-foreground`
3. Check CSS variable values in `globals.css`

### Issue: Custom color not working

**Solution:**

1. Add HEX value to brand tokens
2. Convert to HSL and add to CSS variables
3. Add to Tailwind config
4. Reference using `hsl(var(--token-name))`

### Issue: Inconsistent spacing

**Solution:**

1. Use spacing scale tokens (0, 1, 2, 3, 4, 6, 8, 10, 12)
2. Avoid arbitrary values like `p-[23px]`
3. Use consistent patterns (e.g., card padding always `p-6`)

### Issue: Poor contrast

**Solution:**

1. Always pair background with foreground: `bg-card text-card-foreground`
2. Use muted variants for secondary text: `text-muted-foreground`
3. Test with browser dev tools color contrast checker

## Performance Considerations

### CSS Variable Performance

CSS variables are performant and have minimal overhead:

- Calculated once per theme switch
- No runtime JavaScript required
- Efficient browser caching

### Tailwind Class Names

- Use semantic classes (they're purged efficiently)
- Avoid inline styles (prevent style recalculation)
- Leverage Tailwind's JIT mode for optimal bundle size

### Dark Mode Switching

- Use CSS classes (faster than JavaScript)
- Avoid FOUC (flash of unstyled content) with:
  ```tsx
  // In root layout
  <html className={savedTheme} suppressHydrationWarning>
  ```

## Accessibility

### Color Contrast

All semantic color pairs meet WCAG AA standards:

- `background` + `foreground`: 15:1 (AAA)
- `primary` + `primary-foreground`: 7:1 (AAA)
- `secondary` + `secondary-foreground`: 4.5:1 (AA)
- `destructive` + `destructive-foreground`: 4.5:1 (AA)

### Focus States

All interactive elements have visible focus rings:

```tsx
<Button className="focus-visible:ring-2 focus-visible:ring-ring">
```

### Reduced Motion

Respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Resources

### Internal Documentation

- [Token Naming Conventions](./token-naming.md)
- [Token Mapping](./token-mapping.md)
- [Brand Tokens](../../company/brand/palette.tokens.json)

### External Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [HSL Color Picker](https://hslpicker.com)
- [WCAG Contrast Checker](https://webaim.org/resources/contrastchecker/)

### Tools

- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
- [Browser DevTools](https://developer.chrome.com/docs/devtools/)
- [React Developer Tools](https://react.dev/learn/react-developer-tools)

## Version History

### v1.0.0 (2025-12-20)

- Initial theme reference specification
- Complete token mapping for Sprint 0/1 components
- Dark mode implementation guide
- Component patterns and best practices
