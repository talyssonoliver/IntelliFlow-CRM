# Design Token Naming Conventions

**Version:** 1.0.0
**Last Updated:** 2025-12-20
**Status:** Active

## Overview

This document defines the naming conventions for design tokens across the IntelliFlow CRM design system. It ensures consistency between brand tokens, CSS variables, and Tailwind utilities.

## Naming Philosophy

Design tokens follow a **three-tier naming system**:

1. **Brand Tokens** - Concrete values (HEX colors, pixel values)
2. **CSS Variables** - HSL color values and semantic references
3. **Tailwind Utilities** - Semantic class names

## Brand Token Naming

### Location
- `docs/company/brand/*.tokens.json`

### Structure
```
{category}.{subcategory}.{variant}
```

### Categories

#### Colors
```json
{
  "color": {
    "brand": {
      "primary": { "value": "#2563EB" },
      "secondary": { "value": "#0F172A" },
      "accent": { "value": "#22C55E" }
    },
    "neutral": {
      "0": { "value": "#FFFFFF" },
      "50": { "value": "#F8FAFC" },
      "900": { "value": "#0F172A" }
    },
    "status": {
      "success": { "value": "#22C55E" },
      "warning": { "value": "#F59E0B" },
      "danger": { "value": "#EF4444" },
      "info": { "value": "#2563EB" }
    }
  }
}
```

**Rules:**
- Use lowercase names
- Use hyphens for multi-word tokens
- Include semantic meaning (primary, secondary, accent)
- Numeric scales for neutrals (0-900)

#### Typography
```json
{
  "typography": {
    "fontFamily": {
      "sans": { "value": "Inter, system-ui, ..." },
      "mono": { "value": "ui-monospace, ..." }
    },
    "fontSize": {
      "xs": { "value": "12px" },
      "sm": { "value": "14px" },
      "md": { "value": "16px" }
    },
    "lineHeight": {
      "tight": { "value": "1.2" },
      "normal": { "value": "1.5" },
      "relaxed": { "value": "1.7" }
    }
  }
}
```

**Rules:**
- Use t-shirt sizing (xs, sm, md, lg, xl, 2xl)
- Use descriptive names for line-height (tight, normal, relaxed)
- Font families use generic category names (sans, mono, serif)

#### Spacing
```json
{
  "spacing": {
    "0": { "value": "0px" },
    "1": { "value": "4px" },
    "2": { "value": "8px" },
    "4": { "value": "16px" }
  }
}
```

**Rules:**
- Use numeric scale (0, 1, 2, 3, 4, 5, 6, 8, 10, 12)
- Base unit is 4px (1 = 4px, 2 = 8px, etc.)
- 0 always equals 0px

## CSS Variable Naming

### Location
- `apps/web/src/app/globals.css`

### Structure
```
--{semantic-name}
```

### Semantic Color Variables

**Format:** HSL values without `hsl()` wrapper

```css
:root {
  /* Base colors */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;

  /* Semantic colors */
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;

  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;

  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;

  /* UI elements */
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;

  /* Component-specific */
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;

  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;

  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;

  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;

  /* Other */
  --radius: 0.5rem;
}
```

**Rules:**
- Use kebab-case (lowercase with hyphens)
- Always include foreground variant for colors (`--primary` and `--primary-foreground`)
- Colors are stored as HSL values: `{hue} {saturation}% {lightness}%`
- Non-color values include units (`0.5rem`, not `0.5`)
- Semantic names describe purpose, not appearance (use `--destructive`, not `--red`)

### Dark Mode Variables

```css
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... inverted values ... */
}
```

**Rules:**
- Same variable names as light mode
- Values are inverted (dark backgrounds, light foregrounds)
- Applied via `.dark` class on root element

## Tailwind Utility Naming

### Location
- `apps/web/tailwind.config.ts`

### Structure
```
{property}-{semantic-name}
```

### Color Utilities

```typescript
colors: {
  border: 'hsl(var(--border))',
  input: 'hsl(var(--input))',
  ring: 'hsl(var(--ring))',
  background: 'hsl(var(--background))',
  foreground: 'hsl(var(--foreground))',
  primary: {
    DEFAULT: 'hsl(var(--primary))',
    foreground: 'hsl(var(--primary-foreground))',
  },
  secondary: {
    DEFAULT: 'hsl(var(--secondary))',
    foreground: 'hsl(var(--secondary-foreground))',
  },
  destructive: {
    DEFAULT: 'hsl(var(--destructive))',
    foreground: 'hsl(var(--destructive-foreground))',
  },
  muted: {
    DEFAULT: 'hsl(var(--muted))',
    foreground: 'hsl(var(--muted-foreground))',
  },
  accent: {
    DEFAULT: 'hsl(var(--accent))',
    foreground: 'hsl(var(--accent-foreground))',
  },
  popover: {
    DEFAULT: 'hsl(var(--popover))',
    foreground: 'hsl(var(--popover-foreground))',
  },
  card: {
    DEFAULT: 'hsl(var(--card))',
    foreground: 'hsl(var(--card-foreground))',
  },
}
```

**Usage Examples:**

```tsx
// Background colors
<div className="bg-background">
<div className="bg-primary">
<div className="bg-secondary">

// Text colors
<p className="text-foreground">
<p className="text-primary-foreground">
<p className="text-muted-foreground">

// Border colors
<div className="border border-input">
<div className="border-border">

// Ring/focus colors
<button className="ring-ring">
```

**Rules:**
- Use semantic names (never hardcoded colors like `bg-blue-500`)
- Always wrap CSS variables with `hsl(var(...))`
- Use nested objects for color variants (`.DEFAULT`, `.foreground`)
- Prefix with property: `bg-*`, `text-*`, `border-*`, `ring-*`

## Naming Best Practices

### DO
- Use semantic names that describe purpose
- Keep names consistent across all three tiers
- Use kebab-case for CSS variables
- Use camelCase for brand token JSON keys
- Include foreground/background pairs for all colors
- Use descriptive suffixes (`-foreground`, `-background`)

### DON'T
- Use color names in semantic tokens (avoid `--blue-500`)
- Mix naming conventions (don't use `--primaryColor`)
- Create orphaned tokens (always include foreground if you have background)
- Use ambiguous names (`--color-1`, `--thing`)
- Include color format in name (`--primary-hex`, `--primary-hsl`)

## Examples of Correct Usage

### Adding a New Semantic Color

**1. Brand Token** (if needed)
```json
{
  "color": {
    "status": {
      "warning": { "value": "#F59E0B" }
    }
  }
}
```

**2. CSS Variable**
```css
:root {
  --warning: 38 92% 50%;
  --warning-foreground: 48 96% 89%;
}

.dark {
  --warning: 32 95% 44%;
  --warning-foreground: 48 96% 89%;
}
```

**3. Tailwind Config**
```typescript
colors: {
  warning: {
    DEFAULT: 'hsl(var(--warning))',
    foreground: 'hsl(var(--warning-foreground))',
  },
}
```

**4. Usage in Component**
```tsx
<div className="bg-warning text-warning-foreground">
  Warning message
</div>
```

## Migration Guidelines

### When Renaming Tokens

1. Update brand token JSON
2. Update CSS variables (both `:root` and `.dark`)
3. Update Tailwind config
4. Search codebase for old class names
5. Update all component usage
6. Run type checking: `pnpm run typecheck`
7. Run tests: `pnpm run test`
8. Visual regression testing

### When Adding New Tokens

1. Add to brand tokens JSON (if concrete value)
2. Add CSS variable with semantic name
3. Add Tailwind utility
4. Document in `token-mapping.md`
5. Add usage example to component library

### When Deprecating Tokens

1. Mark as deprecated in documentation
2. Add console warning in development
3. Provide migration path to new token
4. Remove after 2 sprint cycles

## Validation

All token names must pass these checks:

- **Brand tokens:** Valid JSON, follows `{category}.{subcategory}.{variant}` pattern
- **CSS variables:** Starts with `--`, uses kebab-case, has valid HSL value
- **Tailwind utilities:** Defined in config, references valid CSS variable
- **No orphans:** Every color has a foreground variant
- **No duplicates:** Same name not used for different purposes

## References

- [Brand Tokens](../../company/brand/palette.tokens.json)
- [CSS Variables](../../apps/web/src/app/globals.css)
- [Tailwind Config](../../apps/web/tailwind.config.ts)
- [Token Mapping](./token-mapping.md)
- [Theme Reference](./theme-reference-spec.md)
