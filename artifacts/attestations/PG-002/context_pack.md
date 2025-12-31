# PG-002: Features Page - Context Pack

**Task ID**: PG-002
**Run ID**: 20251230-001852-PG-002-a3f8
**Sprint**: 11
**Owner**: Growth FE (STOA-Foundation)
**Created**: 2025-12-30T00:18:52Z

---

## Task Summary

Implement the Features page (`/features`) showcasing IntelliFlow CRM's capabilities with:
- Response time <200ms
- Lighthouse score ≥90
- Conversion-optimized layout
- Brand-consistent styling

---

## Prerequisites Acknowledged

### Brand & Design System

**File**: `docs/company/brand/style-guide.md`
**Key Patterns**:
- Primary color: #137fec (IntelliFlow blue)
- Typography: Inter font family
- Component patterns: Cards, buttons, badges
- Dark mode support with `dark:` variants

**File**: `docs/company/brand/visual-identity.md`
**Design Tokens**:
- Primary: #137fec
- Primary Hover: #0e6ac7
- Background Light: #f6f7f8
- Background Dark: #101922
- Material Symbols Outlined icons

**File**: `docs/company/brand/accessibility-patterns.md`
**Requirements**:
- WCAG 2.1 AA compliance
- 4.5:1 contrast ratio for text
- Keyboard navigation
- ARIA labels for icons
- Focus indicators (2px ring, primary color)

### Messaging & Positioning

**File**: `docs/company/messaging/positioning.md`
**Key Messages**:
- One-liner: "AI-first CRM with automation + governance-grade validation"
- Positioning: "For teams that need lightweight CRM with real automation"
- Pillars: Automation with safeguards, Clear governance, Modern stack, Observability

### Existing Infrastructure

**File**: `apps/web/src/app/layout.tsx`
**Current Structure**:
- Root layout with Navigation component
- ThemeProvider for dark mode
- Material Symbols Outlined font loaded
- Inter font family
- Metadata configuration for SEO

**File**: `apps/web/src/app/page.tsx`
**Existing Home Page**:
- Internal landing page for authenticated users
- Features cards with icons
- Stats grid
- CTA section
- Uses IntelliFlow design system

### Page Registry & Sitemap

**File**: `docs/design/page-registry.md`
**Requirements**:
- Path convention: `apps/web/src/app/{route}/page.tsx`
- KPIs: Load <200ms, Lighthouse >90
- E2E tests required

**File**: `docs/design/sitemap.md`
**Route Mapping**:
- `/features` → [PG-002] Sprint 11
- Public pages under `(public)/` route group
- Separated from authenticated app routes

---

## Technical Requirements

### Framework & Stack
- **Next.js 16.0.10** with App Router
- **React 19** with Server Components (preferred)
- **Tailwind CSS 4** for styling
- **TypeScript** strict mode (no `any` types)
- **shadcn/ui** components from `@intelliflow/ui`

### Performance Targets
- **Response time**: p95 <100ms, p99 <200ms
- **Lighthouse score**: ≥90 (all categories)
- **First Contentful Paint**: <1 second
- **Accessibility**: WCAG 2.1 AA compliant

### File Structure
```
apps/web/src/app/(public)/
├── layout.tsx              # Public pages layout
└── features/
    └── page.tsx           # Features page (THIS FILE)
```

### Data Requirements
- Static content (no API calls initially)
- Feature list in `artifacts/misc/features-content.json`
- Conversion tracking setup in `artifacts/misc/conversion-tracking.js`

---

## Features to Showcase

Based on positioning and existing capabilities:

### Core Features
1. **AI Lead Scoring** - Automated prioritization with ML models
2. **Smart Contacts** - AI-powered insights and relationship mapping
3. **Pipeline Analytics** - Real-time forecasting and analytics
4. **Workflow Automation** - Visual workflow builder with templates
5. **Document Management** - E-signature integration (DocuSign/Adobe)
6. **Multi-tenancy** - Secure workspace isolation

### AI/Intelligence Features
7. **AI Insights** - Churn prediction, next best action, lifetime value
8. **Explainability** - Model transparency and trust scoring
9. **Feedback Loop** - Human-in-the-loop for AI improvements

### Security & Governance
10. **Zero Trust** - Row-level security, audit logging
11. **RBAC** - Role-based access control
12. **Compliance** - GDPR, ISO 42001 ready

---

## Design Patterns to Use

### Hero Section
```tsx
<section className="bg-gradient-to-br from-[#137fec]/10 to-indigo-500/10">
  <div className="container mx-auto px-6 py-16">
    <h1 className="text-4xl font-bold text-slate-900 dark:text-white">
      Powerful Features for <span className="text-[#137fec]">Modern Teams</span>
    </h1>
  </div>
</section>
```

### Feature Grid
```tsx
<div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
  {features.map(feature => (
    <Card className="p-6 hover:border-[#137fec] transition-all">
      <div className="w-12 h-12 bg-[#137fec]/10 rounded-lg flex items-center justify-center">
        <span className="material-symbols-outlined text-[#137fec]">{feature.icon}</span>
      </div>
      <h3 className="text-lg font-semibold mt-4">{feature.title}</h3>
      <p className="text-slate-600 dark:text-slate-400">{feature.description}</p>
    </Card>
  ))}
</div>
```

### CTA Section
- Gradient background (primary to indigo)
- White text with high contrast
- Primary action button
- Secondary link to pricing

---

## Acceptance Criteria

1. ✅ Page renders at `/features` route
2. ✅ Response time <200ms (verified with Lighthouse)
3. ✅ Lighthouse score ≥90 (Performance, Accessibility, Best Practices, SEO)
4. ✅ All 12 features displayed with icons and descriptions
5. ✅ Dark mode support (respects system preference)
6. ✅ Keyboard navigation works
7. ✅ ARIA labels on all interactive elements
8. ✅ Responsive design (mobile, tablet, desktop)
9. ✅ Conversion tracking configured
10. ✅ Features content extracted to JSON file

---

## Artifacts to Create

1. **ARTIFACT**: `apps/web/src/app/(public)/features/page.tsx`
2. **ARTIFACT**: `apps/web/src/app/(public)/layout.tsx` (if not exists)
3. **ARTIFACT**: `artifacts/misc/features-content.json`
4. **ARTIFACT**: `artifacts/misc/conversion-tracking.js`
5. **EVIDENCE**: `artifacts/attestations/PG-002/context_ack.json`
6. **EVIDENCE**: `artifacts/attestations/PG-002/test-results.json`
7. **EVIDENCE**: `artifacts/attestations/PG-002/lighthouse-report.json`

---

## Validation Method

1. **VALIDATE**: `pnpm test` - All tests pass
2. **AUDIT**: Manual review - Visual QA against brand guidelines
3. **GATE**: Lighthouse score ≥90 - Performance audit
4. **VALIDATE**: `pnpm typecheck` - No TypeScript errors
5. **VALIDATE**: `pnpm lint` - No ESLint warnings

---

## Dependencies Status

- **PG-001** (Home Page): BACKLOG - Can proceed with brand docs ready
- **GTM-002** (Messaging): DONE ✅
- **BRAND-001** (Visual Identity): DONE ✅

---

## Context Acknowledgment

I acknowledge that I have read and understood:
- IntelliFlow CRM brand guidelines and visual identity
- Accessibility requirements (WCAG 2.1 AA)
- Performance targets (Response <200ms, Lighthouse ≥90)
- Positioning and messaging strategy
- Existing app structure and conventions
- File naming and import conventions
- Test coverage requirements (>90%)
