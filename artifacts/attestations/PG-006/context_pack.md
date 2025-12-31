# PG-006 Context Pack

**Task**: Partners Page
**Sprint**: 11
**Section**: Public Pages
**Owner**: Growth FE (STOA-Foundation)
**Status**: In Progress
**Created**: 2025-12-31

---

## Executive Summary

Implement a public-facing partners page showcasing partner logos, partnership benefits, and integration opportunities. The page must achieve Lighthouse ≥90 and response time <200ms.

---

## Dependencies

| ID | Status | Notes |
|----|--------|-------|
| PG-001 | COMPLETED | Home page structure (using existing (public) layout) |
| GTM-002 | DONE | Analytics tracking ready |
| BRAND-001 | DONE | Brand guidelines established |

**Decision**: Proceeding with existing `(public)` layout structure.

---

## Prerequisites Verified

### File References
- ✅ `.specify/memory/constitution.md` - Architecture rules and standards
- ✅ `docs/design/page-registry.md` - Page conventions and patterns
- ✅ `audit-matrix.yml` - Quality gates and validation rules
- ✅ `docs/company/brand/visual-identity.md` - Colors, typography, spacing
- ✅ `docs/company/brand/style-guide.md` - Component patterns
- ✅ `docs/company/brand/dos-and-donts.md` - Best practices
- ✅ `docs/company/brand/accessibility-patterns.md` - WCAG 2.1 AA patterns
- ✅ `docs/company/messaging/positioning.md` - Brand messaging
- ✅ `apps/web/src/app/(public)/page.tsx` - Home page reference
- ✅ `apps/web/src/app/(public)/layout.tsx` - Public layout structure

### Environment
- ✅ Partner logos defined (to be created in partner-benefits.json)
- ✅ Benefits outlined (to be structured in data file)

---

## Technical Requirements

### Stack
- **Framework**: Next.js 16.0.10 with App Router (static generation)
- **Styling**: Tailwind CSS 4 with brand tokens
- **Components**: Minimal dependencies, semantic HTML
- **Testing**: Vitest for unit tests

### Architecture
- **Pattern**: Server Component (static generation for optimal performance)
- **Type Safety**: Strict TypeScript
- **Performance**: Minimal JavaScript, optimized images

---

## Page Structure

### 1. Hero Section
- **Headline**: "Partner with IntelliFlow CRM"
- **Subheadline**: Value proposition for partners
- **CTA**: "Become a Partner" button
- **Background**: Brand gradient (matching home page)

### 2. Partner Logos Grid
- Display current integration partners
- Responsive grid layout (2 cols mobile, 4-6 cols desktop)
- Logo styling: Grayscale with hover color
- Company names for accessibility

### 3. Partnership Benefits
- **For Technology Partners**: API integration, co-marketing, revenue share
- **For Resellers**: Sales enablement, margin structure, dedicated support
- **For Consultants**: Certification program, referral fees, client success tools

### 4. Integration Ecosystem
- Showcase integration categories (CRM, Marketing, Support, Analytics)
- Links to integration marketplace (future)
- API documentation reference

### 5. Become a Partner CTA
- Application process overview
- Contact information
- CTA button to contact or application form

### 6. FAQ Section
- Common partnership questions
- Expandable/collapsible format

---

## Brand Compliance

### Colors
- **Primary**: `#137fec` for CTAs (visual-identity.md)
- **Background**: `#f6f7f8` (light), `#101922` (dark)
- **Text**: `#0f172a` primary, `#475569` secondary

### Typography
- **Font**: Inter
- **Scale**: H1 (48px/bold), H2 (36px/bold), Body (16px/regular)

### Spacing
- **Base**: 4px scale
- **Cards**: 24px padding (p-6)
- **Sections**: 64px (py-16) mobile, 96px (py-24) desktop

### Icons
- **Library**: Material Symbols Outlined
- **Size**: 24px (lg) for feature icons

---

## Accessibility Requirements

Per `accessibility-patterns.md` and WCAG 2.1 AA:

- ✅ Proper heading hierarchy (h1 → h2 → h3)
- ✅ Alt text for partner logos
- ✅ Color contrast ≥4.5:1
- ✅ Keyboard navigation
- ✅ Skip link to main content
- ✅ Semantic HTML (`<section>`, `<nav>`, `<details>`)

---

## Definition of Done

1. **Performance**
   - Response time <200ms (p95)
   - Lighthouse score ≥90
   - Partner logos displayed correctly

2. **Artifacts Created**
   - `apps/web/src/app/(public)/partners/page.tsx`
   - `artifacts/misc/partner-benefits.json`
   - `artifacts/attestations/PG-006/context_ack.json`

3. **Validation**
   - Manual review passed
   - Lighthouse audit ≥90
   - All logos render correctly
   - Responsive on all breakpoints

---

## Partner Data Structure

### partner-benefits.json
```json
{
  "partners": [
    {
      "id": "partner-1",
      "name": "Company Name",
      "logo": "/partners/logo.svg",
      "website": "https://example.com",
      "category": "crm" | "marketing" | "support" | "analytics"
    }
  ],
  "benefits": {
    "technology": [],
    "reseller": [],
    "consultant": []
  },
  "integration_categories": []
}
```

---

## Implementation Plan

### Phase 1: Data File
1. Create `partner-benefits.json` with partner data
2. Define benefit categories
3. Structure integration ecosystem

### Phase 2: Page Component
1. Create partners page with metadata
2. Implement hero section
3. Build partner logos grid
4. Add benefits sections
5. Add CTA section
6. Add FAQ section

### Phase 3: Styling & Responsiveness
1. Apply brand styles
2. Implement responsive grid
3. Add dark mode support
4. Optimize for mobile

### Phase 4: Testing & Validation
1. Create page tests
2. Run Lighthouse audit
3. Test accessibility
4. Manual QA review

---

## Performance Targets

- **Page Load**: FCP <1s, LCP <2.5s
- **Bundle Size**: Minimal (static page, no heavy JS)
- **Images**: Optimized SVG logos
- **Lighthouse**: ≥90 across all metrics

---

## SEO Optimization

- **Title**: "Partner with IntelliFlow CRM | Technology & Business Partners"
- **Description**: "Join our partner ecosystem. Integrate your solution, resell IntelliFlow CRM, or become a certified consultant."
- **Keywords**: partners, integrations, resellers, consultants, API, ecosystem
- **Open Graph**: Partner page metadata

---

## References

- Constitution: `.specify/memory/constitution.md`
- Style Guide: `docs/company/brand/style-guide.md`
- Visual Identity: `docs/company/brand/visual-identity.md`
- Accessibility: `docs/company/brand/accessibility-patterns.md`
- Page Registry: `docs/design/page-registry.md`
- Home Page: `apps/web/src/app/(public)/page.tsx` (reference)
- Contact Page: `apps/web/src/app/(public)/contact/page.tsx` (reference)
