# IntelliFlow Design System - LLM Index
> **Machine-Readable Design System Reference**
> Version: 1.0
> Last Updated: 2025-12-31
> Source: `design-system-preview.html`

## Purpose
This index provides LLM agents with a structured, parseable reference for the IntelliFlow CRM design system. Use this document to quickly locate components, understand patterns, and generate consistent UI code.

## Design Tokens

### Colors
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

### Typography
- **Font Family**: Inter (fallback: system-ui, sans-serif)
- **Scale**: Base 16px
  - xs: 0.75rem (12px)
  - sm: 0.875rem (14px)
  - base: 1rem (16px)
  - lg: 1.125rem (18px)
  - xl: 1.25rem (20px)
  - 2xl: 1.5rem (24px)
  - 3xl: 1.875rem (30px)
  - 4xl: 2.25rem (36px)

### Spacing
- **Base Unit**: 4px (0.25rem)
- **Scale**:
  - 1: 4px
  - 2: 8px
  - 3: 12px
  - 4: 16px
  - 6: 24px
  - 8: 32px
  - 12: 48px
  - 16: 64px

### Border Radius
- **Default**: 0.25rem (4px)
- **lg**: 0.5rem (8px)
- **xl**: 0.75rem (12px)
- **2xl**: 1rem (16px)

### Icons
- **System**: Material Symbols Outlined
- **Usage**: `<span class="material-symbols-outlined">icon_name</span>`
- **Brand Icon**: `grid_view`

## Branding

### Logo
**Type**: Material Icon + Wordmark
**Icon**: Material Symbol "grid_view"
**Full Logo Code**:
```html
<div class="flex items-center gap-3">
  <div class="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
    <span class="material-symbols-outlined text-white text-2xl">grid_view</span>
  </div>
  <div class="text-2xl font-bold">IntelliFlow CRM</div>
</div>
```

**Mark Logo Sizes**:
- Large (64px): Header/Hero
- Medium (48px): Standard Navigation
- Small (32px): Compact UI
- Favicon (32px, 16px): Browser tabs

## Component Inventory

### Layout (4 components)
1. **Flex groups**: Horizontal/vertical flex containers with gap spacing
2. **Grid**: Responsive grid layouts (2/3/4 column patterns)
3. **Panel**: Container component with optional header/footer
4. **Spacer**: Fixed-height vertical spacing component

### Navigation (5 components)
1. **Header**: Application (`AppHeader`) and marketing (`PublicHeader`) variants
2. **Footer**: Application and marketing footer variants
3. **AppSidebar**: Unified collapsible sidebar with expand-on-hover (MANDATORY for all modules)
   - Uses `SidebarProvider` for state management
   - Uses `SidebarConfig` for module-specific navigation
   - Location: `apps/web/src/components/sidebar/`
4. **Breadcrumb**: Navigation trail (basic and with icons)
5. **Pagination**: Page navigation (basic and with info)

**Sidebar Configuration Pattern**:
```typescript
// All sidebar configs located in: apps/web/src/components/sidebar/configs/
import { leadsSidebarConfig } from '@/components/sidebar';

// Available configs:
// leadsSidebarConfig, contactsSidebarConfig, documentsSidebarConfig,
// dealsSidebarConfig, ticketsSidebarConfig, analyticsSidebarConfig,
// agentApprovalsSidebarConfig, notificationsSidebarConfig,
// governanceSidebarConfig, settingsSidebarConfig
```

### Forms (12 components)
1. **Input**: Text input with variants
2. **Textarea**: Multi-line text input
3. **Select**: Dropdown select
4. **Checkbox**: Boolean input
5. **Radio**: Single-choice input group
6. **Switch**: Toggle switch
7. **Slider**: Range input
8. **Autocomplete**: Search with live suggestions
9. **Button**: Primary/secondary/ghost variants
10. **Search**: Search input with icon
11. **Date Picker**: (Reference existing)
12. **Form Validation**: Inline error states

### Display (12 components)
1. **Card**: Content container with variants
2. **Table**: Data table with sorting
3. **List**: Simple and interactive lists
4. **Badge**: Status and category indicators
5. **Avatar**: User avatars
6. **Charts**: Bar, line, donut visualizations
7. **Tabs**: Tab navigation
8. **Accordion**: Collapsible content
9. **Link**: Text links with icons
10. **Data Table**: Advanced table (reference existing)
11. **Empty State**: No data placeholders
12. **Stats Card**: Metric display cards

### Feedback (6 components)
1. **Toast**: Temporary notifications
2. **Alert**: Persistent messages
3. **Progress**: Linear and circular progress
4. **Skeleton**: Loading placeholders
5. **Callout**: Highlighted information boxes
6. **Spinner**: Loading indicator

### Overlays (4 components)
1. **Modal**: Dialog overlays
2. **Popover**: Contextual popovers
3. **Tooltip**: Hover information
4. **Dropdown**: Menu dropdowns

### Utilities (3 components)
1. **Clamp Text**: Line truncation (1/2/3 lines)
2. **Animations**: Transitions and effects
3. **Responsive**: Breakpoint utilities

## Code Patterns

### Responsive Layout
```html
<!-- Mobile-first responsive grid -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <!-- Grid items -->
</div>
```

### Dark Mode
```html
<!-- Light/Dark mode classes -->
<div class="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
  <!-- Content -->
</div>
```

### Interactive States
```html
<!-- Button with all states -->
<button class="px-4 py-2 bg-primary text-white rounded-lg
               hover:bg-primary-hover
               focus:outline-none focus:ring-2 focus:ring-primary/50
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-colors">
  Action
</button>
```

### Form Validation
```html
<!-- Input with error state -->
<input type="text"
       class="w-full px-3 py-2 rounded-lg border
              border-slate-200 dark:border-slate-700
              focus:ring-2 focus:ring-primary/50
              aria-invalid:border-red-500"
       aria-invalid="true">
<p class="text-sm text-red-500 mt-1">Error message</p>
```

## Accessibility Requirements

### Semantic HTML
- Use proper landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`
- Use heading hierarchy: `<h1>` → `<h2>` → `<h3>`
- Use `<button>` for actions, `<a>` for navigation

### ARIA Labels
```html
<!-- Button with aria-label -->
<button aria-label="Toggle dark mode">
  <span class="material-symbols-outlined">dark_mode</span>
</button>

<!-- Input with proper labeling -->
<label for="email">Email address</label>
<input id="email" type="email" aria-required="true">
```

### Keyboard Navigation
- All interactive elements must be keyboard accessible
- Use `tabindex="0"` for custom interactive elements
- Provide visible focus states: `focus:ring-2 focus:ring-primary/50`

### Screen Reader Support
- Use `aria-live` for dynamic content
- Use `role` attributes for custom components
- Hide decorative elements: `aria-hidden="true"`

## Performance Guidelines

### CSS
- Use Tailwind utility classes for consistency
- Minimize custom CSS
- Use CSS variables for theming

### JavaScript
- Defer non-critical scripts
- Use `loading="lazy"` for images
- Minimize DOM manipulation

### Images
- Use appropriate formats (WebP, AVIF)
- Provide `alt` text for all images
- Use responsive image sizes

## File Locations

### Source Files
- **HTML Preview**: `docs/company/brand/design-system-preview.html`
- **React Components**: `packages/ui/src/components/`
- **Design Tokens**: Tailwind config in preview HTML
- **Icons**: Material Symbols Outlined (CDN)

### Usage in Code
```typescript
// Import from @intelliflow/ui package
import { Button, Card, Input } from '@intelliflow/ui';

// Use with proper props
<Button variant="primary" size="md">
  Click me
</Button>
```

## Integration Checklist

When implementing UI from this design system:

- [ ] Use correct color tokens (bg-primary, text-slate-600, etc.)
- [ ] Follow spacing scale (p-4, gap-6, mb-8)
- [ ] Include dark mode classes (dark:bg-slate-900)
- [ ] Add responsive breakpoints (sm:, md:, lg:)
- [ ] Include proper ARIA labels
- [ ] Test keyboard navigation
- [ ] Verify focus states
- [ ] Check contrast ratios (WCAG AA minimum)
- [ ] Test with screen reader
- [ ] Validate semantic HTML

## Common Patterns

### Page Layout
```html
<div class="min-h-screen bg-background-light dark:bg-background-dark">
  <header class="sticky top-0 z-50"><!-- Header --></header>
  <main class="container mx-auto px-4 py-8">
    <!-- Content -->
  </main>
  <footer><!-- Footer --></footer>
</div>
```

### Card Grid
```html
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <div class="p-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
    <!-- Card content -->
  </div>
</div>
```

### Form Group
```html
<div class="space-y-4">
  <div>
    <label class="block text-sm font-medium mb-1">Label</label>
    <input type="text" class="w-full px-3 py-2 rounded-lg border">
  </div>
</div>
```

## Version History

- **v1.0** (2025-12-31): Initial design system documentation
  - Added Overview section with LLM optimization guidelines
  - Updated branding with actual Material Icon logo (grid_view)
  - Added comprehensive component inventory
  - Structured for machine parsing with data attributes
  - Included accessibility and performance guidelines

## Related Documents

- `docs/design/UI_DEVELOPMENT_PROMPT.md`: UI development session guide
- `docs/design/UI_CONSOLIDATION_PLAN.md`: Component consolidation strategy
- `docs/design/sitemap.md`: Page structure and routes
- `Sprint_plan.csv`: Task breakdown and implementation order
