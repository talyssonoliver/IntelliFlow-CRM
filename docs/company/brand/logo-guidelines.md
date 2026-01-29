# IntelliFlow CRM Logo Guidelines

## Logo Assets

### Primary Logo

```
Location: docs/company/brand/assets/logo-primary.svg
```

The IntelliFlow logo consists of:
1. **Logomark** - Stylized "iF" monogram representing intelligent flow
2. **Wordmark** - "IntelliFlow" in Inter Bold

### Logo Variants

| Variant | File | Usage |
|---------|------|-------|
| Primary (Color) | `logo-primary.svg` | Default on light backgrounds |
| Primary (Dark) | `logo-primary-dark.svg` | On dark backgrounds |
| Monochrome White | `logo-white.svg` | On colored/dark backgrounds |
| Monochrome Black | `logo-black.svg` | Single-color printing |
| Logomark Only | `logomark.svg` | Favicons, app icons, small spaces |
| Wordmark Only | `wordmark.svg` | When logomark is shown separately |

---

## Logo Specifications

### Colors

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Logomark | `#137fec` (Primary) | `#137fec` (Primary) |
| Wordmark | `#0f172a` (Slate-900) | `#ffffff` (White) |

### Typography

- **Font**: Inter
- **Weight**: 700 (Bold)
- **Letter-spacing**: -0.02em (tight)

### Proportions

```
┌─────────────────────────────────────────┐
│                                         │
│   ┌──────┐                              │
│   │  iF  │  IntelliFlow                 │
│   └──────┘                              │
│   ◄─ 1x ─►  ◄────── 3.5x ──────►        │
│                                         │
│   Logomark : Wordmark = 1 : 3.5         │
│                                         │
└─────────────────────────────────────────┘
```

### Minimum Sizes

| Context | Minimum Width | Minimum Height |
|---------|---------------|----------------|
| Print | 25mm | 8mm |
| Digital (Full Logo) | 120px | 32px |
| Digital (Logomark Only) | 24px | 24px |
| Favicon | 16px | 16px |

---

## Clear Space

Always maintain clear space around the logo equal to the height of the logomark "iF".

```
          ┌─── Clear space = 1x height ───┐
          │                               │
          ▼                               ▼
     ┌────────────────────────────────────────┐
     │                                        │
     │    ┌──────┐                            │
◄───►│    │  iF  │  IntelliFlow              │◄───►
 1x  │    └──────┘                            │ 1x
     │                                        │
     └────────────────────────────────────────┘
          ▲                               ▲
          │                               │
          └─── Clear space = 1x height ───┘
```

---

## Logo Placement

### Header/Navigation

```html
<!-- Left-aligned in header -->
<header class="h-16 flex items-center px-6 border-b border-slate-200">
  <a href="/" class="flex items-center gap-2">
    <img src="/logo/logomark.svg" alt="" class="h-8 w-8">
    <span class="text-xl font-bold text-slate-900 dark:text-white">
      IntelliFlow
    </span>
  </a>
</header>
```

### Sidebar (Collapsed)

```html
<!-- Logomark only when sidebar collapsed -->
<div class="w-16 flex items-center justify-center py-4">
  <img src="/logo/logomark.svg" alt="IntelliFlow" class="h-8 w-8">
</div>
```

### Footer

```html
<!-- Muted logo in footer -->
<footer class="py-8 border-t border-slate-200">
  <img src="/logo/logo-primary.svg" alt="IntelliFlow" class="h-6 opacity-60">
</footer>
```

### Loading/Splash Screen

```html
<!-- Centered logo with animation -->
<div class="fixed inset-0 flex items-center justify-center bg-white">
  <div class="animate-pulse">
    <img src="/logo/logomark.svg" alt="IntelliFlow" class="h-16 w-16">
  </div>
</div>
```

---

## Background Usage

### Approved Backgrounds

| Background | Logo Variant |
|------------|--------------|
| White (`#ffffff`) | Primary (Color) |
| Light Gray (`#f6f7f8`) | Primary (Color) |
| Dark (`#101922`) | Primary (Dark) or White |
| Primary Blue (`#137fec`) | White monochrome |
| Photography (Light) | Primary (Color) with overlay |
| Photography (Dark) | White monochrome |

### Minimum Contrast

- Logo must have minimum 3:1 contrast ratio against background
- Use white logo on any background darker than `#666666`
- Use dark logo on any background lighter than `#999999`

---

## Incorrect Usage

### DO NOT:

1. **Stretch or distort** the logo
   ```
   ✗ [iF IntelliFlow] ← Horizontally stretched
   ✗ [iF
      IntelliFlow]    ← Vertically stretched
   ```

2. **Change the colors** outside brand palette
   ```
   ✗ Red logomark
   ✗ Gradient fills
   ✗ Rainbow effects
   ```

3. **Add effects**
   ```
   ✗ Drop shadows
   ✗ Outer glow
   ✗ Bevel/emboss
   ✗ 3D effects
   ```

4. **Rotate the logo**
   ```
   ✗ Tilted at angle
   ✗ Vertical orientation
   ```

5. **Place on busy backgrounds** without sufficient contrast
   ```
   ✗ Complex patterns
   ✗ Low-contrast photos
   ✗ Competing graphics
   ```

6. **Modify the typography**
   ```
   ✗ Different font
   ✗ Different weight
   ✗ Different spacing
   ```

7. **Separate elements incorrectly**
   ```
   ✗ Logomark above wordmark (unless specified)
   ✗ Wordmark without proper spacing
   ```

8. **Use outdated versions**
   ```
   ✗ Old logo files
   ✗ Screenshots of logo
   ✗ Recreated versions
   ```

---

## Co-Branding

### Partner Logos

When displaying with partner logos:
- Maintain equal visual weight
- Use consistent heights
- Separate with divider line or adequate spacing
- IntelliFlow logo appears first (left) in horizontal layouts

```html
<div class="flex items-center gap-6">
  <img src="/logo/logo-primary.svg" alt="IntelliFlow" class="h-8">
  <div class="w-px h-8 bg-slate-300"></div>
  <img src="/partner-logo.svg" alt="Partner" class="h-8">
</div>
```

### Powered By

```html
<div class="flex items-center gap-2 text-sm text-slate-500">
  <span>Powered by</span>
  <img src="/logo/logo-primary.svg" alt="IntelliFlow" class="h-5">
</div>
```

---

## Favicon & App Icons

### Sizes Required

| Platform | Size | File |
|----------|------|------|
| Favicon | 16x16, 32x32 | `favicon.ico` |
| Apple Touch | 180x180 | `apple-touch-icon.png` |
| Android | 192x192, 512x512 | `android-chrome-*.png` |
| Windows Tile | 150x150, 310x310 | `mstile-*.png` |
| Open Graph | 1200x630 | `og-image.png` |

### Favicon HTML

```html
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```

---

## File Formats

| Format | Usage |
|--------|-------|
| SVG | Web, digital (preferred) |
| PNG | Digital when SVG not supported |
| PDF | Print materials |
| EPS | Professional printing |

### Exporting Guidelines

- **SVG**: Outline all text, optimize with SVGO
- **PNG**: Export at 2x for retina, use transparency
- **PDF**: Embed fonts, convert text to outlines
- **EPS**: Convert to CMYK for print

---

## Contact

For logo files or usage questions:
- Brand assets: `docs/company/brand/assets/`
- Questions: Create issue with `brand` label
