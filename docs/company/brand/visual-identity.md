# IntelliFlow CRM Visual Identity

This document defines the visual identity for IntelliFlow CRM. All implementations
**MUST** reference the token files as the single source of truth.

## Token Files (Source of Truth)

| File | Purpose |
|------|---------|
| `palette.tokens.json` | Colors (brand, status, priority, pipeline) |
| `typography.tokens.json` | Fonts, sizes, weights, line heights |
| `spacing.tokens.json` | Spacing, border radius, shadows, layout |
| `icons.tokens.json` | Icon library and usage guidelines |

## Brand Attributes

IntelliFlow CRM's visual identity conveys:

- **Modern** - Clean, contemporary design with thoughtful whitespace
- **Professional** - Enterprise-grade appearance suitable for B2B
- **Intelligent** - AI-powered features visualized through data and insights
- **Approachable** - Technical but not intimidating

## Color System

### Primary Brand Color

```
Primary:       #137fec  (Main brand color)
Primary Hover: #0e6ac7  (Darker state for interactions)
Primary Muted: #137fec1a (10% opacity for backgrounds)
```

The primary blue (`#137fec`) is used for:
- Primary buttons and CTAs
- Links and interactive elements
- Active/selected states
- Brand accents

### Background Colors

| Mode  | Background | Surface | Elevated |
|-------|------------|---------|----------|
| Light | `#f6f7f8`  | `#ffffff` | `#ffffff` |
| Dark  | `#101922`  | `#1e2936` | `#1e2936` |

### Status Colors

| Status  | Color     | Background | Text      |
|---------|-----------|------------|-----------|
| Success | `#22c55e` | `#dcfce7`  | `#166534` |
| Warning | `#f59e0b` | `#fef3c7`  | `#92400e` |
| Danger  | `#ef4444` | `#fee2e2`  | `#991b1b` |
| Info    | `#137fec` | `#dbeafe`  | `#1e40af` |

### Pipeline Stage Colors

| Stage         | Color     | Usage |
|---------------|-----------|-------|
| Qualification | `#137fec` | Initial lead stage |
| Proposal      | `#6366f1` | Proposal sent |
| Negotiation   | `#f59e0b` | In negotiation |
| Closed Won    | `#22c55e` | Successfully closed |
| Closed Lost   | `#ef4444` | Lost opportunity |

### Priority Colors

| Priority | Badge Color | Background |
|----------|-------------|------------|
| High     | `#ef4444`   | `#fef2f2`  |
| Medium   | `#f59e0b`   | `#fffbeb`  |
| Low      | `#22c55e`   | `#f0fdf4`  |

## Typography

### Font Family

```css
font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont,
             'Segoe UI', Roboto, sans-serif;
```

Inter is our primary typeface. It provides excellent readability at all sizes
and supports all required font weights.

### Font Weights

| Weight | Name      | Usage |
|--------|-----------|-------|
| 300    | Light     | Large hero text (sparingly) |
| 400    | Regular   | Body text, paragraphs |
| 500    | Medium    | Labels, buttons, emphasized text |
| 600    | Semibold  | Subheadings, card titles |
| 700    | Bold      | Page headings, emphasis |
| 800    | Extrabold | Hero sections (sparingly) |

### Type Scale

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| H1    | 48px | Bold   | 1.25        | Page titles |
| H2    | 36px | Bold   | 1.25        | Section headings |
| H3    | 30px | Semibold | 1.25      | Subsection headings |
| H4    | 24px | Semibold | 1.375     | Card headings |
| H5    | 20px | Medium | 1.375       | Widget titles |
| H6    | 18px | Medium | 1.5         | Small headings |
| Body  | 16px | Regular | 1.5        | Primary content |
| Small | 14px | Regular | 1.5        | Secondary content |
| Caption | 12px | Regular | 1.5      | Labels, captions |

## Spacing System

We use a base-4 spacing system aligned with Tailwind CSS:

| Token | Value | Usage |
|-------|-------|-------|
| 1     | 4px   | Tight internal spacing |
| 2     | 8px   | Default internal spacing |
| 3     | 12px  | Medium internal spacing |
| 4     | 16px  | Default component padding |
| 6     | 24px  | Section padding |
| 8     | 32px  | Large section spacing |
| 12    | 48px  | Page section margins |

## Border Radius

| Token   | Value | Usage |
|---------|-------|-------|
| DEFAULT | 4px   | Buttons, inputs, small cards |
| lg      | 8px   | Cards, modals |
| xl      | 12px  | Large cards, panels |
| full    | 9999px | Avatars, pills, badges |

## Icons

We use **Material Symbols Outlined** as our icon library:

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL@24,400,0" rel="stylesheet">
```

### Icon Sizing

| Size   | Value | Usage |
|--------|-------|-------|
| sm     | 16px  | Inline with small text |
| md     | 20px  | Default button icons |
| lg     | 24px  | Primary icons |
| xl     | 32px  | Feature icons |
| 2xl    | 48px  | Empty states, illustrations |

### Common Icons

| Action | Icon Name |
|--------|-----------|
| Add    | `add` |
| Edit   | `edit` |
| Delete | `delete` |
| Search | `search` |
| Filter | `filter_list` |
| Sort   | `sort` |
| Menu   | `menu` |
| Close  | `close` |
| Settings | `settings` |
| Person | `person` |
| Email  | `mail` |
| Phone  | `phone` |
| Calendar | `calendar_today` |
| Dashboard | `dashboard` |
| Chart  | `bar_chart` |

## Layout

### Sidebar

- **Width (expanded)**: 280px
- **Width (collapsed)**: 64px
- **Background (light)**: `#ffffff`
- **Background (dark)**: `#1e2936`

### Header

- **Height**: 64px
- **Background**: Same as surface color

### Content Area

- **Max width**: 1536px (2xl container)
- **Padding**: 24px (6) on desktop, 16px (4) on mobile

### Breakpoints

| Name | Min Width | Usage |
|------|-----------|-------|
| sm   | 640px     | Mobile landscape |
| md   | 768px     | Tablet |
| lg   | 1024px    | Small desktop |
| xl   | 1280px    | Desktop |
| 2xl  | 1536px    | Large desktop |

## Dark Mode

Dark mode is enabled via the `.dark` class on `<html>`:

```html
<html class="dark">
```

### Color Mapping

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background | `#f6f7f8` | `#101922` |
| Surface | `#ffffff` | `#1e2936` |
| Text Primary | `#0f172a` | `#f8fafc` |
| Text Secondary | `#475569` | `#94a3b8` |
| Border | `#e2e8f0` | `#334155` |

## Accessibility

### Color Contrast

All text must meet WCAG 2.1 AA standards:
- Normal text: 4.5:1 contrast ratio minimum
- Large text (18px+): 3:1 contrast ratio minimum

### Focus States

All interactive elements must have visible focus indicators:
- Ring width: 2px
- Ring color: Primary (`#137fec`)
- Ring offset: 2px

### Motion

Respect user preferences for reduced motion:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

## Tailwind CSS Configuration

Use this Tailwind configuration to match our design system:

```javascript
// tailwind.config.js
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#137fec",
        "primary-hover": "#0e6ac7",
        "background-light": "#f6f7f8",
        "background-dark": "#101922",
        "surface-light": "#ffffff",
        "surface-dark": "#1e2936",
        "border-light": "#e2e8f0",
        "border-dark": "#334155",
      },
      fontFamily: {
        "display": ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
      },
    },
  },
}
```

## File References

### Token Files
- `palette.tokens.json` - Colors (brand, status, priority, pipeline)
- `typography.tokens.json` - Fonts, sizes, weights, line heights
- `spacing.tokens.json` - Spacing, border radius, shadows, layout
- `icons.tokens.json` - Icon library and usage guidelines

### Documentation
- `visual-identity.md` - This file (overview)
- `style-guide.md` - Component patterns with code examples
- `logo-guidelines.md` - Logo usage rules and assets
- `dos-and-donts.md` - Best practices and anti-patterns
- `accessibility-patterns.md` - ARIA patterns and keyboard navigation

### Interactive Preview
- `design-system-preview.html` - Open in browser to see live swatches

### Related
- `docs/design/mockups/*.html` - Page mockups
- `docs/design/page-registry.md` - All UI pages
- `docs/design/sitemap.md` - Application sitemap
