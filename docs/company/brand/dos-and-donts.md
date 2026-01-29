# IntelliFlow Design System: Do's and Don'ts

A quick reference guide for maintaining consistency across the application.

---

## Colors

### DO

```html
<!-- Use semantic color tokens -->
<button class="bg-primary hover:bg-primary-hover">Save</button>
<span class="text-green-600">Success message</span>
<div class="bg-red-50 text-red-800">Error alert</div>
```

- Use the primary blue (`#137fec`) for main CTAs
- Use status colors consistently (green=success, amber=warning, red=error)
- Apply dark mode variants using `dark:` prefix
- Use muted backgrounds for badges (`bg-green-100` not solid `bg-green-500`)

### DON'T

```html
<!-- Hard-coded colors -->
<button class="bg-blue-600">Save</button>  <!-- Wrong blue! -->
<button class="bg-[#2563eb]">Save</button> <!-- Old incorrect value -->

<!-- Random color choices -->
<span class="text-purple-600">Success</span> <!-- Purple for success? -->
<div class="bg-pink-500">Warning</div>       <!-- Pink for warning? -->
```

- Don't use `blue-600` - use `primary` or `#137fec`
- Don't mix color conventions (stick to our palette)
- Don't use low-contrast color combinations
- Don't use colors inconsistently across similar elements

---

## Typography

### DO

```html
<!-- Consistent heading hierarchy -->
<h1 class="text-3xl font-bold">Page Title</h1>
<h2 class="text-2xl font-semibold">Section</h2>
<h3 class="text-xl font-medium">Subsection</h3>
<p class="text-base text-slate-600">Body text</p>
<span class="text-sm text-slate-500">Caption</span>
```

- Use Inter font family throughout
- Follow the type scale (xs, sm, base, lg, xl, 2xl, 3xl)
- Use appropriate font weights (400 body, 500 labels, 600 headings, 700 titles)
- Maintain consistent line heights

### DON'T

```html
<!-- Inconsistent sizing -->
<h1 class="text-4xl">Title</h1>
<h2 class="text-3xl">Also Title?</h2>  <!-- Too close in size -->

<!-- Wrong font -->
<p style="font-family: Arial">Text</p>  <!-- Not Inter! -->

<!-- Random weights -->
<span class="font-black">Label</span>   <!-- Too heavy for label -->
<h1 class="font-normal">Title</h1>      <!-- Too light for title -->
```

- Don't skip heading levels (h1 → h3)
- Don't use custom fonts
- Don't use extreme font weights (100, 900) for regular UI
- Don't use all caps except for small labels

---

## Spacing

### DO

```html
<!-- Consistent spacing scale -->
<div class="p-4">Card padding (16px)</div>
<div class="p-6">Section padding (24px)</div>
<div class="space-y-4">Stacked items with 16px gap</div>
<div class="gap-2">Tight button group (8px)</div>
```

- Use the spacing scale (1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px)
- Keep consistent padding within component types
- Use `gap` for flexbox/grid spacing
- Use `space-y` or `space-x` for stacked layouts

### DON'T

```html
<!-- Arbitrary values -->
<div class="p-[13px]">Odd padding</div>
<div class="mt-[7px]">Random margin</div>

<!-- Inconsistent spacing -->
<div class="p-4">Card 1</div>
<div class="p-6">Card 2</div>  <!-- Same type, different padding! -->
<div class="p-3">Card 3</div>  <!-- More inconsistency -->
```

- Don't use arbitrary pixel values
- Don't mix spacing values for similar components
- Don't use margins when gap/space utilities work
- Don't forget responsive spacing adjustments

---

## Buttons

### DO

```html
<!-- Primary action -->
<button class="bg-primary text-white px-4 py-2 rounded font-medium
               hover:bg-primary-hover transition-colors">
  Save Changes
</button>

<!-- Secondary action -->
<button class="bg-slate-100 text-slate-700 px-4 py-2 rounded font-medium
               hover:bg-slate-200">
  Cancel
</button>

<!-- Destructive action -->
<button class="bg-red-600 text-white px-4 py-2 rounded font-medium
               hover:bg-red-700">
  Delete
</button>
```

- One primary button per view/form
- Use consistent padding and border-radius
- Include hover and focus states
- Use icons with text for clarity

### DON'T

```html
<!-- Multiple primary buttons -->
<button class="bg-primary">Save</button>
<button class="bg-primary">Submit</button>  <!-- Two primaries! -->
<button class="bg-primary">Continue</button> <!-- Three?! -->

<!-- Missing states -->
<button class="bg-primary">Save</button>  <!-- No hover state -->

<!-- Inconsistent styling -->
<button class="rounded-full">Action 1</button>
<button class="rounded-lg">Action 2</button>  <!-- Different radius -->
<button class="rounded-none">Action 3</button> <!-- More variation -->
```

- Don't have multiple primary CTAs competing
- Don't forget hover/focus/disabled states
- Don't mix button styles within the same context
- Don't use buttons for navigation (use links)

---

## Forms

### DO

```html
<!-- Proper form structure -->
<div class="space-y-1.5">
  <label for="email" class="text-sm font-medium text-slate-700">
    Email Address <span class="text-red-500">*</span>
  </label>
  <input
    id="email"
    type="email"
    required
    class="w-full px-3 py-2 border border-slate-300 rounded-lg
           focus:ring-2 focus:ring-primary focus:border-transparent"
    placeholder="you@example.com"
  >
  <p class="text-xs text-slate-500">We'll never share your email.</p>
</div>
```

- Always associate labels with inputs (for/id)
- Mark required fields visibly
- Provide helpful placeholder text
- Include help text when needed
- Show clear error states

### DON'T

```html
<!-- No label -->
<input type="email" placeholder="Email">  <!-- Placeholder ≠ Label! -->

<!-- No error indication -->
<input type="email" value="bad-email">  <!-- How do I know it's wrong? -->

<!-- Inconsistent styling -->
<input class="rounded-full border-2">
<input class="rounded border">  <!-- Different from above -->
<select class="rounded-lg">     <!-- Yet another style -->
```

- Don't use placeholder as the only label
- Don't rely on color alone for errors
- Don't mix input styles within a form
- Don't hide validation until submit

---

## Cards

### DO

```html
<!-- Consistent card structure -->
<div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200
            dark:border-slate-800 p-6">
  <h3 class="text-lg font-semibold mb-4">Card Title</h3>
  <p class="text-slate-600 dark:text-slate-400">Content here.</p>
</div>
```

- Use consistent border-radius (rounded-lg for cards)
- Apply proper dark mode variants
- Maintain consistent internal padding
- Use subtle borders, not heavy shadows

### DON'T

```html
<!-- Heavy shadows -->
<div class="shadow-2xl">Heavy card</div>

<!-- Inconsistent corners -->
<div class="rounded-xl">Card 1</div>
<div class="rounded-md">Card 2</div>
<div class="rounded-3xl">Card 3</div>

<!-- Missing dark mode -->
<div class="bg-white border-gray-200">
  <!-- Broken in dark mode! -->
</div>
```

- Don't overuse shadows (prefer borders)
- Don't vary border-radius across cards
- Don't forget dark mode styles
- Don't nest cards too deeply

---

## Icons

### DO

```html
<!-- Proper icon usage -->
<button class="inline-flex items-center gap-2">
  <span class="material-symbols-outlined text-lg">add</span>
  Add Contact
</button>

<!-- Icon-only with accessibility -->
<button aria-label="Delete item" class="p-2 hover:bg-slate-100 rounded">
  <span class="material-symbols-outlined">delete</span>
</button>
```

- Use Material Symbols Outlined consistently
- Size icons appropriately (16-24px for UI)
- Include text labels when possible
- Add aria-label for icon-only buttons

### DON'T

```html
<!-- Mixed icon libraries -->
<span class="material-symbols-outlined">add</span>
<i class="fas fa-user"></i>  <!-- FontAwesome mixed in! -->
<svg><!-- Random SVG --></svg>

<!-- Wrong sizing -->
<span class="material-symbols-outlined text-4xl">tiny_action</span>

<!-- Missing accessibility -->
<button><span class="material-symbols-outlined">delete</span></button>
<!-- No aria-label! Screen readers can't read this -->
```

- Don't mix icon libraries
- Don't use oversized icons for small actions
- Don't use icon-only buttons without aria-label
- Don't use filled icons (stick to outlined)

---

## Tables

### DO

```html
<table class="w-full">
  <thead>
    <tr class="bg-slate-50 dark:bg-slate-800/50">
      <th class="px-4 py-3 text-left text-xs font-medium text-slate-500
                 uppercase tracking-wider">
        Name
      </th>
    </tr>
  </thead>
  <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30">
      <td class="px-4 py-3 text-sm">John Doe</td>
    </tr>
  </tbody>
</table>
```

- Use consistent header styling
- Add hover states for rows
- Include proper dividers
- Right-align numeric columns

### DON'T

```html
<!-- No structure -->
<div>Name | Email | Status</div>
<div>John | john@... | Active</div>

<!-- Inconsistent alignment -->
<td class="text-left">$1,234</td>   <!-- Numbers should be right-aligned -->
<td class="text-center">$567</td>   <!-- Inconsistent! -->

<!-- Missing states -->
<tr><!-- No hover, no zebra striping, nothing --></tr>
```

- Don't use divs instead of tables for tabular data
- Don't mix text alignments for same column type
- Don't forget interactive states
- Don't omit table headers

---

## Dark Mode

### DO

```html
<!-- Proper dark mode implementation -->
<div class="bg-white dark:bg-slate-900
            text-slate-900 dark:text-white
            border-slate-200 dark:border-slate-800">
  Content
</div>
```

- Always pair light and dark variants
- Use slate-900 for dark backgrounds
- Adjust text colors for readability
- Test both modes during development

### DON'T

```html
<!-- Missing dark variants -->
<div class="bg-white text-black">
  <!-- Unreadable in dark mode! -->
</div>

<!-- Wrong dark colors -->
<div class="dark:bg-black">  <!-- Too dark, use slate-900 -->
<div class="dark:text-gray-100">  <!-- Use slate palette -->
```

- Don't forget dark: variants
- Don't use pure black (#000)
- Don't assume colors "just work" in dark mode
- Don't use different color palettes (stick to slate)

---

## Accessibility

### DO

```html
<!-- Proper focus states -->
<button class="focus:outline-none focus:ring-2 focus:ring-primary
               focus:ring-offset-2">
  Action
</button>

<!-- Sufficient contrast -->
<p class="text-slate-600">Secondary text (4.5:1 on white)</p>

<!-- Semantic HTML -->
<nav aria-label="Main navigation">
  <ul>
    <li><a href="/">Home</a></li>
  </ul>
</nav>
```

- Ensure 4.5:1 contrast for text
- Include visible focus indicators
- Use semantic HTML elements
- Add ARIA labels where needed

### DON'T

```html
<!-- Removing focus outlines -->
<button class="outline-none focus:outline-none">
  <!-- Keyboard users can't see focus! -->
</button>

<!-- Low contrast -->
<p class="text-slate-300">Light gray on white = unreadable</p>

<!-- Non-semantic structure -->
<div onclick="navigate()">Fake link</div>
```

- Don't remove focus indicators completely
- Don't use low-contrast color combinations
- Don't use divs for interactive elements
- Don't rely on color alone to convey meaning

---

## Responsive Design

### DO

```html
<!-- Mobile-first approach -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <!-- Cards -->
</div>

<!-- Responsive text -->
<h1 class="text-2xl md:text-3xl lg:text-4xl">Heading</h1>

<!-- Responsive spacing -->
<div class="p-4 md:p-6 lg:p-8">Content</div>
```

- Start with mobile styles, add breakpoints up
- Test all breakpoints during development
- Use responsive utilities consistently
- Hide/show elements appropriately

### DON'T

```html
<!-- Fixed widths -->
<div class="w-[800px]">Breaks on mobile!</div>

<!-- Desktop-first (harder to maintain) -->
<div class="grid-cols-4 md:grid-cols-2 sm:grid-cols-1">
  <!-- Confusing order -->
</div>

<!-- Forgetting mobile -->
<div class="hidden md:block">
  <!-- What do mobile users see? Nothing! -->
</div>
```

- Don't use fixed pixel widths for layouts
- Don't design desktop-first
- Don't hide critical content on mobile
- Don't forget touch targets (min 44px)

---

## Quick Reference Card

| Category | DO | DON'T |
|----------|-----|-------|
| Colors | Use `#137fec` for primary | Use `blue-600` or other blues |
| Typography | Inter font, follow type scale | Mix fonts, skip heading levels |
| Spacing | Use 4px base scale (4,8,12,16,24,32) | Arbitrary pixel values |
| Buttons | One primary CTA per view | Multiple competing primaries |
| Forms | Labels + placeholders + help text | Placeholder-only labels |
| Cards | `rounded-lg`, subtle borders | Heavy shadows, mixed radii |
| Icons | Material Symbols Outlined only | Mixed icon libraries |
| Dark Mode | Always pair `dark:` variants | Forget dark mode styles |
| A11y | Focus rings, ARIA labels, contrast | Remove focus, low contrast |
| Responsive | Mobile-first, test all sizes | Fixed widths, desktop-only |
