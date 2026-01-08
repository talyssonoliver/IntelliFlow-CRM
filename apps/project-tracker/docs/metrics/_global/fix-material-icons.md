# Fix Material Icons CLS/FOUT — IntelliFlow CRM

**Task**: Implement Option 1 — fix Material Icons Outlined CLS/FOUT on hard refresh

## Problem

Material Icons Outlined currently causes:
- **FOUT (Flash of Unstyled Text)**: Ligature text like "search", "menu" appears briefly before icon renders
- **CLS (Cumulative Layout Shift)**: Icon containers expand/collapse causing layout jank

## Goal

Eliminate first-render UI shifting and ligature text visibility while keeping existing markup unchanged across the codebase.

---

## Scope

- **Affected App**: `apps/web/` (Next.js 16.0.10 frontend)
- **Current Usage**: Ligature-based Material Icons Outlined (e.g., `<span class="material-icons-outlined">search</span>`)
- **UI Package**: `packages/ui/src/components/` (shadcn/ui based)
- **Global Styles**: `apps/web/src/app/globals.css`

---

## Acceptance Criteria

1. On hard refresh, no visible ligature text ("search", "menu", etc.) appears
2. Icon containers do not expand/collapse; CLS materially reduced
3. Works in Chrome, Edge, Safari, Firefox
4. Zero changes to existing icon markup in app code

---

## Implementation Tasks

### A) Self-Host and Preload the WOFF2 Font

1. **Download the font file**:
   ```bash
   # Download Material Icons Outlined WOFF2
   curl -o apps/web/public/fonts/MaterialIconsOutlined.woff2 \
     "https://fonts.gstatic.com/s/materialiconsoutlined/v109/gok-H7zzDkdnRel8-DQ6KAXJ69wP1tGnf4ZGhUce.woff2"
   ```

2. **Add preload to document head** in `apps/web/src/app/layout.tsx`:
   ```tsx
   <head>
     <link
       rel="preload"
       href="/fonts/MaterialIconsOutlined.woff2"
       as="font"
       type="font/woff2"
       crossOrigin="anonymous"
     />
   </head>
   ```

3. **Add @font-face** in `apps/web/src/app/globals.css`:
   ```css
   @font-face {
     font-family: "Material Icons Outlined";
     font-style: normal;
     font-weight: 400;
     font-display: block;
     src: url("/fonts/MaterialIconsOutlined.woff2") format("woff2");
   }
   ```

### B) Global CSS Hardening

Add to `apps/web/src/app/globals.css`:

```css
.material-icons-outlined {
  font-family: "Material Icons Outlined";
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  display: inline-block;
  width: 24px;
  height: 24px;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: middle;
  letter-spacing: normal;
  text-transform: none;
  word-wrap: normal;
  -webkit-font-feature-settings: "liga";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  -moz-osx-font-smoothing: grayscale;
}

/* Size variants if needed */
.material-icons-outlined.mi-18 {
  font-size: 18px;
  width: 18px;
  height: 18px;
}

.material-icons-outlined.mi-20 {
  font-size: 20px;
  width: 20px;
  height: 20px;
}

.material-icons-outlined.mi-32 {
  font-size: 32px;
  width: 32px;
  height: 32px;
}
```

### C) Prevent First-Paint Ligature Text

**Option 1 (Preferred): fonts-ready gate**

Add to `apps/web/src/app/globals.css`:

```css
/* Hide icons until font loaded */
.material-icons-outlined {
  visibility: hidden;
}

/* Show once fonts ready */
.fonts-ready .material-icons-outlined {
  visibility: visible;
}
```

Add to `apps/web/src/app/layout.tsx` (in the `<head>` or early `<body>`):

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `document.fonts?.ready?.then(function(){document.documentElement.classList.add('fonts-ready')});`,
  }}
/>
```

**Option 2 (Simpler): Rely on font-display: block only**

If gating is undesirable, the `font-display: block` in `@font-face` will briefly hide icons (blank space) rather than show ligature text. Keep reserved box sizing to prevent CLS.

### D) Remove Conflicting Font Imports

Check these files for duplicate Google Fonts imports and remove if self-hosting:

- `apps/web/src/app/layout.tsx` — Remove any `<link>` to Google Fonts Material Icons
- `apps/web/src/app/globals.css` — Remove any `@import` for Material Icons from fonts.googleapis.com

**Ensure single source of truth** for "Material Icons Outlined" font-family.

---

## Verification

### Manual Testing

1. **Hard refresh with DevTools cache disabled**
2. **Network throttling**: Set to "Slow 3G" in DevTools
3. **Confirm**:
   - No ligature words ("search", "menu", etc.) visible during load
   - Icons appear once font ready
   - Layout remains stable (no jumping)

### Automated Test

Add to `tests/e2e/icons.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Material Icons Loading", () => {
  test("icons should not show ligature text on load", async ({ page }) => {
    // Throttle network to catch FOUT
    await page.route("**/*.woff2", (route) => {
      route.continue();
    });

    await page.goto("/dashboard");

    // Wait for fonts-ready class
    await expect(page.locator("html")).toHaveClass(/fonts-ready/, {
      timeout: 10000,
    });

    // Check icon elements have correct font-family
    const iconElement = page.locator(".material-icons-outlined").first();
    const fontFamily = await iconElement.evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    expect(fontFamily).toContain("Material Icons Outlined");

    // Verify icon is visible
    await expect(iconElement).toBeVisible();
  });

  test("icons should maintain stable dimensions", async ({ page }) => {
    await page.goto("/dashboard");

    const icon = page.locator(".material-icons-outlined").first();
    const box = await icon.boundingBox();

    expect(box?.width).toBe(24);
    expect(box?.height).toBe(24);
  });
});
```

---

## Deliverables Checklist

- [ ] Font asset: `apps/web/public/fonts/MaterialIconsOutlined.woff2`
- [ ] Preload tag in `apps/web/src/app/layout.tsx`
- [ ] `@font-face` in `apps/web/src/app/globals.css`
- [ ] Global `.material-icons-outlined` CSS rules
- [ ] Font-ready gate (JS + CSS) OR documented decision for `font-display: block` only
- [ ] Removed conflicting Google Fonts imports
- [ ] Playwright test in `tests/e2e/icons.spec.ts`
- [ ] Manual verification notes

---

## Constraints

- **Zero functional changes** to existing icon markup in app code
- **Minimal bundle impact** — no new dependencies
- **Performance budget**: First Contentful Paint < 1s (per CLAUDE.md KPIs)

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/layout.tsx` | Root layout, add preload + font-ready script |
| `apps/web/src/app/globals.css` | Global styles, @font-face + icon CSS |
| `apps/web/public/fonts/` | Self-hosted font assets |
| `packages/ui/src/components/` | UI components using icons |
| `tests/e2e/` | Playwright E2E tests |
