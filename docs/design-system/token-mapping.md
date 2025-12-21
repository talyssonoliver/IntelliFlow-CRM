# Design Token Mapping

**Version:** 1.0.0 **Last Updated:** 2025-12-20 **Status:** Active

## Overview

This document maps brand tokens from `docs/company/brand/*.tokens.json` to their
corresponding CSS variables and Tailwind utilities. It provides the bridge
between design specifications (HEX colors, pixel values) and implementation (HSL
colors, semantic tokens).

## Color Mapping

### Brand Primary Color

| Brand Token           | Value            | CSS Variable           | HSL Value           | Tailwind Class               |
| --------------------- | ---------------- | ---------------------- | ------------------- | ---------------------------- |
| `color.brand.primary` | `#2563EB`        | `--primary`            | `221.2 83.2% 53.3%` | `bg-primary`, `text-primary` |
| -                     | (auto-generated) | `--primary-foreground` | `210 40% 98%`       | `text-primary-foreground`    |

**HEX to HSL Conversion:**

- HEX: `#2563EB` (Blue 600)
- RGB: `rgb(37, 99, 235)`
- HSL: `hsl(221.2, 83.2%, 53.3%)`

**Usage:**

```tsx
// Primary button
<Button className="bg-primary text-primary-foreground">
  Click me
</Button>

// Primary text
<h1 className="text-primary">Title</h1>
```

**Dark Mode:**

```css
.dark {
  --primary: 217.2 91.2% 59.8%; /* Lighter blue for dark backgrounds */
  --primary-foreground: 222.2 47.4% 11.2%;
}
```

### Brand Secondary Color

| Brand Token             | Value            | CSS Variable             | HSL Value           | Tailwind Class                   |
| ----------------------- | ---------------- | ------------------------ | ------------------- | -------------------------------- |
| `color.brand.secondary` | `#0F172A`        | `--secondary`            | `210 40% 96.1%`     | `bg-secondary`, `text-secondary` |
| -                       | (auto-generated) | `--secondary-foreground` | `222.2 47.4% 11.2%` | `text-secondary-foreground`      |

**Note:** The brand secondary color (`#0F172A` - Slate 900) is used as the base
dark color, but the CSS variable `--secondary` in light mode uses a light gray
(`210 40% 96.1%`) for UI surfaces. The actual brand color is mapped to the dark
mode background.

**HEX to HSL Conversion:**

- HEX: `#0F172A` (Slate 900)
- RGB: `rgb(15, 23, 42)`
- HSL: `hsl(222.2, 84%, 4.9%)`

**Usage:**

```tsx
// Secondary button
<Button variant="secondary">
  Cancel
</Button>

// Light surface in light mode
<div className="bg-secondary text-secondary-foreground">
  Content area
</div>
```

**Dark Mode:**

```css
.dark {
  --secondary: 217.2 32.6% 17.5%; /* Dark slate */
  --secondary-foreground: 210 40% 98%;
}
```

### Brand Accent Color

| Brand Token          | Value            | CSS Variable          | HSL Value           | Tailwind Class             |
| -------------------- | ---------------- | --------------------- | ------------------- | -------------------------- |
| `color.brand.accent` | `#22C55E`        | `--accent`            | `210 40% 96.1%`     | `bg-accent`, `text-accent` |
| -                    | (auto-generated) | `--accent-foreground` | `222.2 47.4% 11.2%` | `text-accent-foreground`   |

**Note:** The brand accent color (`#22C55E` - Green 500) is reserved for
status.success. The CSS variable `--accent` is used for subtle UI accents and
hover states, currently mapped to a light gray.

**HEX to HSL Conversion (Brand Green):**

- HEX: `#22C55E` (Green 500)
- RGB: `rgb(34, 197, 94)`
- HSL: `hsl(142.1, 70.6%, 45.3%)`

**Usage:**

```tsx
// Accent hover state
<Button
  variant="ghost"
  className="hover:bg-accent hover:text-accent-foreground"
>
  Hover me
</Button>
```

**Dark Mode:**

```css
.dark {
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
}
```

### Neutral Colors

| Brand Token         | Value     | CSS Variable                 | HSL Value           | Tailwind Class          | Usage                   |
| ------------------- | --------- | ---------------------------- | ------------------- | ----------------------- | ----------------------- |
| `color.neutral.0`   | `#FFFFFF` | `--background` (light)       | `0 0% 100%`         | `bg-background`         | Page backgrounds        |
| `color.neutral.50`  | `#F8FAFC` | -                            | `210 40% 98%`       | -                       | Reserved for future use |
| `color.neutral.100` | `#F1F5F9` | -                            | `214 32% 96%`       | -                       | Reserved for future use |
| `color.neutral.200` | `#E2E8F0` | `--border` (light)           | `214.3 31.8% 91.4%` | `border-border`         | Borders, dividers       |
| `color.neutral.300` | `#CBD5E1` | -                            | `214.4 31.8% 83.5%` | -                       | Reserved for future use |
| `color.neutral.600` | `#475569` | `--muted-foreground` (light) | `215.4 16.3% 46.9%` | `text-muted-foreground` | Secondary text          |
| `color.neutral.800` | `#1F2937` | -                            | `217.2 32.6% 17.5%` | -                       | Reserved for future use |
| `color.neutral.900` | `#0F172A` | `--foreground` (light)       | `222.2 84% 4.9%`    | `text-foreground`       | Primary text            |

**HEX to HSL Conversions:**

| HEX       | RGB                  | HSL                        |
| --------- | -------------------- | -------------------------- |
| `#FFFFFF` | `rgb(255, 255, 255)` | `hsl(0, 0%, 100%)`         |
| `#F8FAFC` | `rgb(248, 250, 252)` | `hsl(210, 40%, 98%)`       |
| `#F1F5F9` | `rgb(241, 245, 249)` | `hsl(214, 32%, 96%)`       |
| `#E2E8F0` | `rgb(226, 232, 240)` | `hsl(214.3, 31.8%, 91.4%)` |
| `#CBD5E1` | `rgb(203, 213, 225)` | `hsl(214.4, 31.8%, 83.5%)` |
| `#475569` | `rgb(71, 85, 105)`   | `hsl(215.4, 16.3%, 46.9%)` |
| `#1F2937` | `rgb(31, 41, 55)`    | `hsl(217.2, 32.6%, 17.5%)` |
| `#0F172A` | `rgb(15, 23, 42)`    | `hsl(222.2, 84%, 4.9%)`    |

**Usage:**

```tsx
// Page background
<div className="bg-background text-foreground">
  Main content
</div>

// Bordered card
<div className="border border-border">
  Card content
</div>

// Muted text
<p className="text-muted-foreground">
  Helper text
</p>
```

### Status Colors

| Brand Token            | Value     | CSS Variable    | HSL Value           | Tailwind Class   | Usage                   |
| ---------------------- | --------- | --------------- | ------------------- | ---------------- | ----------------------- |
| `color.status.success` | `#22C55E` | (not mapped)    | `142.1 70.6% 45.3%` | -                | Success states (future) |
| `color.status.warning` | `#F59E0B` | (not mapped)    | `38 92% 50%`        | -                | Warning states (future) |
| `color.status.danger`  | `#EF4444` | `--destructive` | `0 84.2% 60.2%`     | `bg-destructive` | Error states            |
| `color.status.info`    | `#2563EB` | `--primary`     | `221.2 83.2% 53.3%` | `bg-primary`     | Info states             |

**HEX to HSL Conversions:**

| Color           | HEX       | RGB                 | HSL                        |
| --------------- | --------- | ------------------- | -------------------------- |
| Success (Green) | `#22C55E` | `rgb(34, 197, 94)`  | `hsl(142.1, 70.6%, 45.3%)` |
| Warning (Amber) | `#F59E0B` | `rgb(245, 158, 11)` | `hsl(38, 92%, 50%)`        |
| Danger (Red)    | `#EF4444` | `rgb(239, 68, 68)`  | `hsl(0, 84.2%, 60.2%)`     |
| Info (Blue)     | `#2563EB` | `rgb(37, 99, 235)`  | `hsl(221.2, 83.2%, 53.3%)` |

**Current Mapping:**

- `status.danger` → `--destructive` (mapped)
- `status.info` → `--primary` (mapped)
- `status.success` → Not yet mapped (reserved for future implementation)
- `status.warning` → Not yet mapped (reserved for future implementation)

**Usage:**

```tsx
// Destructive button
<Button variant="destructive">
  Delete
</Button>

// Error message
<div className="bg-destructive text-destructive-foreground">
  Error occurred
</div>
```

**Dark Mode:**

```css
.dark {
  --destructive: 0 62.8% 30.6%; /* Darker red for dark backgrounds */
  --destructive-foreground: 210 40% 98%;
}
```

## Semantic Color Mapping

### Background & Foreground

| Semantic Token | Light Mode HSL               | Dark Mode HSL                | Usage           |
| -------------- | ---------------------------- | ---------------------------- | --------------- |
| `--background` | `0 0% 100%` (White)          | `222.2 84% 4.9%` (Slate 900) | Page background |
| `--foreground` | `222.2 84% 4.9%` (Slate 900) | `210 40% 98%` (Slate 50)     | Primary text    |

**Theme Inversion:** In dark mode, these values are inverted to maintain proper
contrast.

### UI Element Colors

| Semantic Token         | Light Mode HSL      | Dark Mode HSL       | Usage               |
| ---------------------- | ------------------- | ------------------- | ------------------- |
| `--card`               | `0 0% 100%`         | `222.2 84% 4.9%`    | Card backgrounds    |
| `--card-foreground`    | `222.2 84% 4.9%`    | `210 40% 98%`       | Card text           |
| `--popover`            | `0 0% 100%`         | `222.2 84% 4.9%`    | Popover backgrounds |
| `--popover-foreground` | `222.2 84% 4.9%`    | `210 40% 98%`       | Popover text        |
| `--muted`              | `210 40% 96.1%`     | `217.2 32.6% 17.5%` | Muted backgrounds   |
| `--muted-foreground`   | `215.4 16.3% 46.9%` | `215 20.2% 65.1%`   | Muted text          |

### Input & Interaction Colors

| Semantic Token | Light Mode HSL                  | Dark Mode HSL                   | Usage         |
| -------------- | ------------------------------- | ------------------------------- | ------------- |
| `--border`     | `214.3 31.8% 91.4%` (Slate 200) | `217.2 32.6% 17.5%` (Slate 800) | Borders       |
| `--input`      | `214.3 31.8% 91.4%`             | `217.2 32.6% 17.5%`             | Input borders |
| `--ring`       | `221.2 83.2% 53.3%`             | `224.3 76.3% 48%`               | Focus rings   |

## Typography Mapping

| Brand Token                  | Value                   | Tailwind Class | Usage         |
| ---------------------------- | ----------------------- | -------------- | ------------- |
| `typography.fontFamily.sans` | `Inter, system-ui, ...` | `font-sans`    | Body text, UI |
| `typography.fontFamily.mono` | `ui-monospace, ...`     | `font-mono`    | Code blocks   |

**Tailwind Config:**

```typescript
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
  mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
}
```

### Font Sizes

| Brand Token               | Value  | Tailwind Class | Usage                |
| ------------------------- | ------ | -------------- | -------------------- |
| `typography.fontSize.xs`  | `12px` | `text-xs`      | Captions, fine print |
| `typography.fontSize.sm`  | `14px` | `text-sm`      | Small text, labels   |
| `typography.fontSize.md`  | `16px` | `text-base`    | Body text (default)  |
| `typography.fontSize.lg`  | `18px` | `text-lg`      | Large body text      |
| `typography.fontSize.xl`  | `20px` | `text-xl`      | Small headings       |
| `typography.fontSize.2xl` | `24px` | `text-2xl`     | Headings             |

### Line Heights

| Brand Token                     | Value | Tailwind Class    | Usage                  |
| ------------------------------- | ----- | ----------------- | ---------------------- |
| `typography.lineHeight.tight`   | `1.2` | `leading-tight`   | Headings, compact text |
| `typography.lineHeight.normal`  | `1.5` | `leading-normal`  | Body text (default)    |
| `typography.lineHeight.relaxed` | `1.7` | `leading-relaxed` | Long-form content      |

## Spacing Mapping

| Brand Token  | Value  | Tailwind Scale | Classes                  |
| ------------ | ------ | -------------- | ------------------------ |
| `spacing.0`  | `0px`  | `0`            | `m-0`, `p-0`, `gap-0`    |
| `spacing.1`  | `4px`  | `1`            | `m-1`, `p-1`, `gap-1`    |
| `spacing.2`  | `8px`  | `2`            | `m-2`, `p-2`, `gap-2`    |
| `spacing.3`  | `12px` | `3`            | `m-3`, `p-3`, `gap-3`    |
| `spacing.4`  | `16px` | `4`            | `m-4`, `p-4`, `gap-4`    |
| `spacing.5`  | `20px` | `5`            | `m-5`, `p-5`, `gap-5`    |
| `spacing.6`  | `24px` | `6`            | `m-6`, `p-6`, `gap-6`    |
| `spacing.8`  | `32px` | `8`            | `m-8`, `p-8`, `gap-8`    |
| `spacing.10` | `40px` | `10`           | `m-10`, `p-10`, `gap-10` |
| `spacing.12` | `48px` | `12`           | `m-12`, `p-12`, `gap-12` |

**Note:** Tailwind's default spacing scale is used. Brand spacing tokens align
with Tailwind's 4px base unit.

## Border Radius Mapping

| CSS Variable | Value                       | Tailwind Class | Usage                 |
| ------------ | --------------------------- | -------------- | --------------------- |
| `--radius`   | `0.5rem` (8px)              | `rounded-lg`   | Default border radius |
| -            | `calc(var(--radius) - 2px)` | `rounded-md`   | Medium border radius  |
| -            | `calc(var(--radius) - 4px)` | `rounded-sm`   | Small border radius   |

**Tailwind Config:**

```typescript
borderRadius: {
  lg: 'var(--radius)',
  md: 'calc(var(--radius) - 2px)',
  sm: 'calc(var(--radius) - 4px)',
}
```

## Shadow Mapping

| Tailwind Class | Value                                                                | Usage                    |
| -------------- | -------------------------------------------------------------------- | ------------------------ |
| `shadow-sm`    | `0 1px 2px 0 rgb(0 0 0 / 0.05)`                                      | Subtle elevation         |
| `shadow`       | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`      | Default card shadow      |
| `shadow-md`    | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`   | Medium elevation (hover) |
| `shadow-lg`    | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Large elevation (modals) |
| `shadow-none`  | `none`                                                               | Remove shadow            |

**Note:** Tailwind's default shadow scale is used. Shadows are subtle to
maintain modern, clean design aesthetic.

**Usage:**

```tsx
// Default card shadow
<Card className="shadow">
  Card content
</Card>

// Hover elevation
<Card className="shadow hover:shadow-md transition-shadow">
  Interactive card
</Card>

// Modal/Dialog
<Dialog className="shadow-lg">
  Modal content
</Dialog>
```

## Component State Mapping

### Button States

| State          | Variant   | CSS Classes                                              |
| -------------- | --------- | -------------------------------------------------------- |
| Default        | `default` | `bg-primary text-primary-foreground hover:bg-primary/90` |
| Hover          | `default` | `hover:bg-primary/90` (90% opacity)                      |
| Focus          | `default` | `focus-visible:ring-2 focus-visible:ring-ring`           |
| Disabled       | `default` | `disabled:pointer-events-none disabled:opacity-50`       |
| Active/Pressed | `default` | (uses default styling)                                   |

**Other Button Variants:**

| Variant       | CSS Classes                                                                      | Usage                  |
| ------------- | -------------------------------------------------------------------------------- | ---------------------- |
| `destructive` | `bg-destructive text-destructive-foreground hover:bg-destructive/90`             | Delete, remove actions |
| `outline`     | `border border-input bg-background hover:bg-accent hover:text-accent-foreground` | Secondary actions      |
| `secondary`   | `bg-secondary text-secondary-foreground hover:bg-secondary/80`                   | Secondary actions      |
| `ghost`       | `hover:bg-accent hover:text-accent-foreground`                                   | Tertiary actions       |
| `link`        | `text-primary underline-offset-4 hover:underline`                                | Text links             |

### Input States

| State    | CSS Classes                                       |
| -------- | ------------------------------------------------- |
| Default  | `border-input bg-background`                      |
| Focus    | `focus-visible:ring-2 focus-visible:ring-ring`    |
| Disabled | `disabled:cursor-not-allowed disabled:opacity-50` |
| Error    | (future: `border-destructive`)                    |

### Card States

| State   | CSS Classes                                         |
| ------- | --------------------------------------------------- |
| Default | `bg-card text-card-foreground border border-border` |
| Hover   | (future: `hover:shadow-md transition-shadow`)       |

## Component Token Coverage

### Current Coverage (Sprint 0/1 Components)

| Component  | Token Coverage | Status                   |
| ---------- | -------------- | ------------------------ |
| Button     | 100%           | All variants mapped      |
| Card       | 100%           | All states mapped        |
| Input      | 100%           | All states mapped        |
| Label      | 100%           | Uses semantic foreground |
| Table      | 100%           | Uses semantic colors     |
| Form       | 100%           | Uses semantic colors     |
| Data Table | 100%           | Uses semantic colors     |

**Total Coverage:** 100% of Sprint 0/1 components

**Unmapped Brand Tokens:**

- `color.status.success` - Reserved for future status components
- `color.status.warning` - Reserved for future status components
- `color.neutral.50`, `100`, `300`, `800` - Reserved for future use

## Migration Guidelines

### HEX to HSL Conversion Process

When adding a new color from brand tokens:

1. **Convert HEX to HSL:**

   ```javascript
   // Use online converter or CSS
   // Example: #2563EB
   // RGB: rgb(37, 99, 235)
   // HSL: hsl(221.2, 83.2%, 53.3%)
   ```

2. **Extract HSL values for CSS variable:**

   ```css
   /* Store without hsl() wrapper */
   --new-color: 221.2 83.2% 53.3%;
   ```

3. **Add to Tailwind config:**
   ```typescript
   colors: {
     newColor: {
       DEFAULT: 'hsl(var(--new-color))',
       foreground: 'hsl(var(--new-color-foreground))',
     },
   }
   ```

### Adding New Semantic Tokens

1. Add brand token to `docs/company/brand/palette.tokens.json`
2. Convert HEX to HSL
3. Add CSS variable to `apps/web/src/app/globals.css` (both `:root` and `.dark`)
4. Add Tailwind utility to `apps/web/tailwind.config.ts`
5. Document mapping in this file
6. Update component if needed

### Updating Existing Tokens

1. Update brand token HEX value
2. Recalculate HSL value
3. Update CSS variable
4. No changes needed to Tailwind config (uses CSS var reference)
5. Update this documentation
6. Visual regression testing

## Validation Checklist

- [x] All brand colors have HSL conversions documented
- [x] All semantic colors have light and dark mode values
- [x] All colors have foreground variants
- [x] All components use semantic tokens (no hardcoded colors)
- [x] Token names follow naming conventions
- [x] Coverage >= 90% of Sprint 0/1 components (100% achieved)
- [x] No ambiguous token names
- [x] Typography tokens mapped (font families, sizes, line heights)
- [x] Spacing tokens mapped (0px to 48px scale)
- [x] Border radius tokens mapped
- [x] Shadow tokens documented

## Tools & References

### HEX to HSL Converters

- [HSL Color Picker](https://hslpicker.com/)
- [Color Converter](https://convertingcolors.com/)

### Documentation References

- [Brand Tokens](../../company/brand/palette.tokens.json)
- [CSS Variables](../../apps/web/src/app/globals.css)
- [Tailwind Config](../../apps/web/tailwind.config.ts)
- [Token Naming](./token-naming.md)
- [Theme Reference](./theme-reference-spec.md)

### Tailwind Documentation

- [Customizing Colors](https://tailwindcss.com/docs/customizing-colors)
- [Color Reference](https://tailwindcss.com/docs/background-color)
- [Dark Mode](https://tailwindcss.com/docs/dark-mode)
