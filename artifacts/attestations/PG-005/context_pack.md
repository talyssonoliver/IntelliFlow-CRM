# PG-005 Context Pack

**Task**: Contact Page
**Sprint**: 11
**Section**: Public Pages
**Owner**: Growth FE (STOA-Foundation)
**Status**: In Progress
**Created**: 2025-12-31

---

## Executive Summary

Implement a public-facing contact page with form submission, email handling, and brand compliance. The page must achieve Lighthouse ≥90 and response time <200ms.

---

## Dependencies

| ID | Status | Notes |
|----|--------|-------|
| PG-001 | PLANNED | Home page structure (proceeding with existing (public) layout) |
| GTM-002 | DONE | Analytics tracking ready |
| BRAND-001 | DONE | Brand guidelines established |

**Decision**: Proceeding with PG-005 using existing `(public)` layout structure.

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
- ✅ `apps/web/src/app/(public)/page.tsx` - Home page reference (corrected path)
- ✅ `apps/web/src/app/(public)/layout.tsx` - Public layout structure

### Environment
- ✅ Contact form designed (following brand guidelines)
- ✅ Validation rules (Zod schema required per constitution)

---

## Technical Requirements

### Stack
- **Framework**: Next.js 16.0.10 with App Router
- **Styling**: Tailwind CSS 4 with brand tokens
- **Validation**: Zod schemas (end-to-end type safety)
- **Components**: shadcn/ui from `packages/ui/`
- **Testing**: Vitest for unit tests, Playwright for E2E

### Architecture
- **Pattern**: Hexagonal architecture (constitution §64-74)
- **Type Safety**: No `any` types, strict TypeScript
- **Performance**: p95 <100ms API, FCP <1s (constitution §146-150)

---

## Brand Compliance

### Colors
- **Primary**: `#137fec` for CTAs (visual-identity.md §26-38)
- **Background**: `#f6f7f8` (light), `#101922` (dark)
- **Status**: Green for success, Red for error
- **Text**: `#0f172a` primary, `#475569` secondary

### Typography
- **Font**: Inter (visual-identity.md §76-82)
- **Scale**: H1 (48px/bold), Body (16px/regular), Small (14px/regular)
- **Weights**: 400 (body), 500 (labels), 600 (headings), 700 (titles)

### Spacing
- **Base**: 4px scale (constitution spacing tokens)
- **Cards**: 24px padding (p-6)
- **Sections**: 16px (p-4) mobile, 24px (p-6) desktop
- **Border Radius**: 8px (rounded-lg) for cards

### Icons
- **Library**: Material Symbols Outlined only (visual-identity.md §135-171)
- **Size**: 20px (md) for button icons

---

## Accessibility Requirements

Per `accessibility-patterns.md` and WCAG 2.1 AA:

- ✅ Focus rings visible (2px ring, primary color)
- ✅ Color contrast ≥4.5:1 for text
- ✅ Form labels associated with inputs (for/id)
- ✅ Required fields marked visually and semantically
- ✅ Error states with `aria-invalid` and `role="alert"`
- ✅ Semantic HTML (`<form>`, `<label>`, `<input>`)
- ✅ Keyboard navigation (Tab, Enter, Escape)

---

## Definition of Done

1. **Performance**
   - Response time <200ms (p95)
   - Lighthouse score ≥90 (performance, a11y, SEO, best practices)
   - Form submission working

2. **Artifacts Created**
   - `apps/web/src/app/(public)/contact/page.tsx`
   - `apps/web/src/components/shared/contact-form.tsx`
   - `apps/web/src/lib/shared/email-handler.ts`
   - `artifacts/attestations/PG-005/context_ack.json`

3. **Validation**
   - Manual review passed
   - Lighthouse audit ≥90
   - All form fields validated with Zod
   - Accessibility tested (keyboard nav, screen reader)

---

## Implementation Plan

### Phase 1: Schema & Types
1. Create Zod validation schema for contact form
2. Define TypeScript types from schema
3. Create test data fixtures

### Phase 2: Email Handler (TDD)
1. Write tests for email handler service
2. Implement email handler with validation
3. Add error handling and logging

### Phase 3: Contact Form Component (TDD)
1. Write tests for form component
2. Implement form with brand compliance
3. Add client-side validation
4. Add accessibility attributes

### Phase 4: Contact Page
1. Create page component with metadata
2. Integrate contact form
3. Apply brand styling
4. Add responsive design

### Phase 5: Validation
1. Run Lighthouse audit
2. Test keyboard navigation
3. Verify performance metrics
4. Manual QA review

---

## File Structure

```
apps/web/src/app/(public)/contact/
└── page.tsx                          # Contact page component

apps/web/src/components/shared/
└── contact-form.tsx                  # Reusable contact form component

apps/web/src/lib/shared/
└── email-handler.ts                  # Email service integration

apps/web/src/app/(public)/contact/__tests__/
└── page.test.tsx                     # Page tests

apps/web/src/components/shared/__tests__/
└── contact-form.test.tsx             # Component tests

apps/web/src/lib/shared/__tests__/
└── email-handler.test.ts             # Service tests

artifacts/attestations/PG-005/
├── context_pack.md                   # This file
└── context_ack.json                  # Acknowledgement (to be created)
```

---

## Brand References

### Form Components (style-guide.md §239-273)
- Label: `text-sm font-medium text-slate-700`
- Input: `w-full px-3 py-2 border border-slate-300 rounded-lg`
- Focus: `focus:ring-2 focus:ring-primary focus:border-transparent`
- Error: `border-red-500`, `text-red-600`
- Help text: `text-xs text-slate-500`

### Buttons (style-guide.md §36-103)
- Primary: `bg-[#137fec] hover:bg-[#0e6ac7] text-white px-6 py-3 rounded-lg font-semibold`
- Secondary: `bg-slate-100 text-slate-700 px-6 py-3 rounded-lg font-semibold hover:bg-slate-200`

### Layout (visual-identity.md §173-200)
- Max width: 1536px (2xl container)
- Padding: 24px desktop, 16px mobile
- Responsive: Mobile-first approach

---

## Security Considerations (constitution §126-135)

- ✅ Input validation with Zod
- ✅ No secrets in code
- ✅ XSS prevention (sanitize user input)
- ✅ CSRF protection (Next.js built-in)
- ✅ Rate limiting on email endpoint
- ✅ Spam prevention (honeypot or reCAPTCHA)

---

## Testing Strategy

### Unit Tests (Vitest)
- Zod schema validation
- Email handler logic
- Form component behavior

### Integration Tests
- Form submission flow
- API endpoint response
- Error handling

### E2E Tests (Playwright)
- Complete user journey
- Form validation states
- Success/error scenarios

### Accessibility Tests
- axe-core automated testing
- Manual keyboard navigation
- Screen reader compatibility

---

## Performance Targets

- **Page Load**: FCP <1s, LCP <2.5s
- **API Response**: <200ms (p95)
- **Bundle Size**: Minimal (code splitting)
- **Lighthouse**: ≥90 across all metrics

---

## Rollback Plan

If implementation fails:
1. Revert file changes via git
2. Remove contact route from sitemap
3. Update page registry
4. Document blockers in debt ledger

---

## References

- Constitution: `.specify/memory/constitution.md`
- Style Guide: `docs/company/brand/style-guide.md`
- Visual Identity: `docs/company/brand/visual-identity.md`
- Accessibility: `docs/company/brand/accessibility-patterns.md`
- Page Registry: `docs/design/page-registry.md`
- Audit Matrix: `audit-matrix.yml`
