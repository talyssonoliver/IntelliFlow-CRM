# PG-003: Pricing Page - Implementation Specification

**Task ID**: PG-003
**Run ID**: 20251230-011543-PG-003
**Sprint**: 11
**Status**: Planning
**Created**: 2025-12-30T01:15:43Z

---

## 1. Summary

Implement a high-performance, conversion-optimized Pricing page at `/pricing` with 4 pricing tiers, interactive pricing calculator, feature comparison table, and FAQ section.

---

## 2. Technical Specification

### 2.1 Route Structure

```
apps/web/src/app/(public)/
├── layout.tsx              # Public pages layout (from PG-002)
├── pricing/
│   └── page.tsx           # Pricing page implementation (NEW)
└── components/pricing/
    ├── PricingCard.tsx    # Individual pricing tier card (NEW)
    ├── PricingCalculator.tsx # Interactive calculator (NEW)
    ├── PricingToggle.tsx  # Monthly/Annual toggle (NEW)
    ├── ComparisonTable.tsx # Feature comparison (NEW)
    └── FAQSection.tsx     # FAQ accordion (NEW)
```

### 2.2 Component Architecture

```tsx
// Page Structure (Server Component)
export default function PricingPage() {
  return (
    <>
      <HeroSection />
      <PricingGrid />
      <ComparisonTable />
      <PricingCalculator />
      <FAQSection />
      <CTASection />
    </>
  );
}

// Sub-components (Client Components)
<HeroSection>
  - H1: "Simple, Transparent Pricing"
  - Subheading: "Choose the perfect plan for your team"
  - PricingToggle component (Monthly/Annual)
  - Savings badge when annual selected
</HeroSection>

<PricingGrid>
  - 4 PricingCard components (Starter, Professional, Enterprise, Custom)
  - Each card:
    - Icon
    - Tier name
    - Description
    - Price (updated by billing toggle)
    - Feature list with checkmarks
    - CTA button
    - "Most Popular" badge for Professional
</PricingGrid>

<ComparisonTable>
  - 4 categories (Core CRM, AI & Automation, Security, Support)
  - Responsive table with horizontal scroll on mobile
  - Checkmarks, text values, or "false" for each feature
  - Sticky header
</ComparisonTable>

<PricingCalculator>
  - User count slider (1-100+)
  - Tier selector (radio cards)
  - Real-time calculation display
  - Annual savings calculator
  - "See detailed pricing" link
</PricingCalculator>

<FAQSection>
  - 8 common questions
  - Accordion-style (expand/collapse)
  - Search functionality (optional for MVP)
</FAQSection>

<CTASection>
  - "Ready to transform your sales?"
  - Primary: "Start Free Trial"
  - Secondary: "Contact Sales"
  - Gradient background
</CTASection>
```

### 2.3 Data Structure

**File**: `apps/web/src/data/pricing-data.json` ✅ Created

**Type Definitions**:
```typescript
interface PricingTier {
  id: string;
  name: string;
  description: string;
  price: {
    monthly: number | null;
    annual: number | null;
    custom?: boolean;
    label?: string;
  };
  features: string[];
  cta: string;
  ctaLink: string;
  mostPopular: boolean;
  icon: string;
}

interface ComparisonFeature {
  name: string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
  custom: boolean | string;
}

interface FAQ {
  question: string;
  answer: string;
}
```

### 2.4 Pricing Calculator Logic

```typescript
// Calculator utilities
export function calculatePrice(
  tier: PricingTier,
  userCount: number,
  billing: 'monthly' | 'annual'
): {
  pricePerUser: number;
  totalMonthly: number;
  totalAnnual?: number;
  savings?: number;
} {
  const basePrice = billing === 'monthly' ? tier.price.monthly : tier.price.annual;

  if (!basePrice) {
    return { pricePerUser: 0, totalMonthly: 0 };
  }

  const totalMonthly = basePrice * userCount;

  if (billing === 'annual') {
    const totalAnnual = totalMonthly * 12;
    const monthlyEquivalent = (tier.price.monthly || 0) * userCount * 12;
    const savings = monthlyEquivalent - totalAnnual;

    return {
      pricePerUser: basePrice,
      totalMonthly,
      totalAnnual,
      savings,
    };
  }

  return {
    pricePerUser: basePrice,
    totalMonthly,
  };
}

// Format currency
export function formatCurrency(amount: number, currency: string = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
```

### 2.5 Styling Specification

**Colors** (from visual-identity.md):
- Primary: `#137fec`
- Primary Hover: `#0e6ac7`
- Success: `#10b981` (for "Most Popular" badge)
- Background Light: `#f6f7f8`
- Background Dark: `#101922`

**Typography** (Inter font):
- Pricing amount: `text-4xl lg:text-5xl font-bold`
- Tier name: `text-2xl font-semibold`
- Feature list: `text-base text-slate-600 dark:text-slate-400`

**Component Patterns**:
```tsx
// Pricing Card
<Card className="relative p-8 hover:border-[#137fec] hover:shadow-xl transition-all">
  {mostPopular && (
    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
      <span className="bg-[#10b981] text-white px-4 py-1 rounded-full text-sm font-medium">
        Most Popular
      </span>
    </div>
  )}

  {/* Icon */}
  <div className="w-12 h-12 bg-[#137fec]/10 rounded-lg flex items-center justify-center mb-4">
    <span className="material-symbols-outlined text-2xl text-[#137fec]">
      {icon}
    </span>
  </div>

  {/* Price */}
  <div className="text-4xl font-bold text-slate-900 dark:text-white">
    £{price}
    <span className="text-lg text-slate-600 dark:text-slate-400">/user/mo</span>
  </div>

  {/* CTA */}
  <Button className="w-full bg-[#137fec] hover:bg-[#0e6ac7]">
    {cta}
  </Button>
</Card>

// Billing Toggle
<div className="inline-flex items-center gap-4 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
  <button
    className={cn(
      "px-4 py-2 rounded-md transition-all",
      !isAnnual && "bg-white dark:bg-slate-700 shadow-sm"
    )}
    onClick={() => setBilling('monthly')}
  >
    Monthly
  </button>
  <button
    className={cn(
      "px-4 py-2 rounded-md transition-all flex items-center gap-2",
      isAnnual && "bg-white dark:bg-slate-700 shadow-sm"
    )}
    onClick={() => setBilling('annual')}
  >
    Annual
    <span className="text-xs bg-[#10b981] text-white px-2 py-0.5 rounded">
      Save 17%
    </span>
  </button>
</div>
```

---

## 3. Test-Driven Development Plan

### 3.1 Unit Tests

**File**: `apps/web/src/app/(public)/pricing/__tests__/page.test.tsx`

```tsx
describe('PricingPage', () => {
  describe('Page Structure', () => {
    it('should render hero section with correct heading');
    it('should display billing toggle (Monthly/Annual)');
    it('should show savings badge when annual selected');
  });

  describe('Pricing Tiers', () => {
    it('should render all 4 pricing tiers');
    it('should display "Most Popular" badge on Professional tier');
    it('should show correct prices based on billing toggle');
    it('should calculate annual discount correctly (17%)');
  });

  describe('Feature Lists', () => {
    it('should render feature lists for each tier');
    it('should have checkmark icons for features');
    it('should display correct number of features per tier');
  });

  describe('Comparison Table', () => {
    it('should render comparison table');
    it('should have 4 categories');
    it('should show checkmarks for included features');
    it('should show text values for partial features');
    it('should be horizontally scrollable on mobile');
  });

  describe('Pricing Calculator', () => {
    it('should render calculator component');
    it('should allow user count selection (1-100+)');
    it('should calculate total price correctly');
    it('should show annual savings when annual billing');
    it('should update price in real-time');
  });

  describe('FAQ Section', () => {
    it('should render all 8 FAQs');
    it('should expand/collapse on click');
    it('should have accessible accordion controls');
  });

  describe('CTA Section', () => {
    it('should render call-to-action section');
    it('should have "Start Free Trial" button');
    it('should have "Contact Sales" button');
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy');
    it('should have ARIA labels for interactive elements');
    it('should support keyboard navigation');
    it('should have proper color contrast');
  });

  describe('Dark Mode', () => {
    it('should have dark mode variants for all elements');
    it('should use correct dark mode colors');
  });

  describe('Brand Consistency', () => {
    it('should use IntelliFlow primary color (#137fec)');
    it('should use Material Symbols icons');
    it('should use success color for badges (#10b981)');
  });
});
```

**File**: `apps/web/src/app/(public)/pricing/__tests__/calculator.test.ts`

```tsx
describe('Pricing Calculator', () => {
  describe('Price Calculations', () => {
    it('should calculate monthly price correctly');
    it('should calculate annual price with 17% discount');
    it('should calculate total for multiple users');
    it('should show savings amount for annual billing');
  });

  describe('User Count Validation', () => {
    it('should enforce minimum user count (1)');
    it('should handle maximum user count (100+)');
    it('should update price when user count changes');
  });

  describe('Currency Formatting', () => {
    it('should format GBP correctly (£29)');
    it('should handle decimal places correctly');
    it('should show "per user" suffix');
  });
});
```

**File**: `apps/web/src/app/(public)/pricing/__tests__/data.test.ts`

```tsx
describe('Pricing Data', () => {
  it('should have 4 pricing tiers');
  it('should have all required fields for each tier');
  it('should have valid pricing for each tier');
  it('should have annual price 17% less than monthly');
  it('should have comparison features for all categories');
  it('should have at least 8 FAQs');
  it('should have metadata with currency and version');
});
```

### 3.2 Integration Tests

**File**: `apps/web/src/app/(public)/pricing/__tests__/integration.test.tsx`

```tsx
describe('Pricing Page Integration', () => {
  it('should toggle between monthly and annual pricing');
  it('should update all cards when billing changes');
  it('should navigate to sign-up with correct plan parameter');
  it('should navigate to contact page from Enterprise CTA');
});
```

### 3.3 E2E Tests

**File**: `tests/e2e/pricing.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
  test('should load within 2 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/pricing');
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(2000);
  });

  test('should have Lighthouse score ≥90', async ({ page }) => {
    // Lighthouse CI integration
  });

  test('should toggle billing and update prices', async ({ page }) => {
    await page.goto('/pricing');

    // Initial state: monthly
    const initialPrice = await page.locator('[data-testid="starter-price"]').textContent();

    // Toggle to annual
    await page.click('[data-testid="billing-toggle-annual"]');

    // Verify price changed
    const annualPrice = await page.locator('[data-testid="starter-price"]').textContent();
    expect(annualPrice).not.toBe(initialPrice);
  });

  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/pricing');
    await page.keyboard.press('Tab');
    // Test focus indicators
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pricing');
    // Test mobile layout
  });
});
```

---

## 4. Implementation Steps

### Step 1: Write Tests (TDD - RED)
- Create test files
- Write all unit tests (will fail)
- Write integration tests
- Write data validation tests

### Step 2: Create Pricing Calculator Component
**File**: `apps/web/src/components/pricing/PricingCalculator.tsx`

```tsx
'use client';

import { useState } from 'react';
import { Card } from '@intelliflow/ui';
import pricingData from '@/data/pricing-data.json';

export function PricingCalculator() {
  const [userCount, setUserCount] = useState(10);
  const [selectedTier, setSelectedTier] = useState('professional');
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');

  // Calculate price
  const tier = pricingData.tiers.find(t => t.id === selectedTier);
  const price = billing === 'monthly' ? tier?.price.monthly : tier?.price.annual;
  const total = (price || 0) * userCount;

  return (
    <Card className="p-8">
      {/* User count slider */}
      {/* Tier selector */}
      {/* Price display */}
      {/* Savings calculation */}
    </Card>
  );
}
```

### Step 3: Create Pricing Card Component
**File**: `apps/web/src/components/pricing/PricingCard.tsx`

### Step 4: Create Pricing Toggle Component
**File**: `apps/web/src/components/pricing/PricingToggle.tsx`

### Step 5: Create Comparison Table Component
**File**: `apps/web/src/components/pricing/ComparisonTable.tsx`

### Step 6: Create FAQ Section Component
**File**: `apps/web/src/components/pricing/FAQSection.tsx`

### Step 7: Implement Pricing Page
**File**: `apps/web/src/app/(public)/pricing/page.tsx`

### Step 8: Create Stripe Integration (Mock)
**File**: `apps/web/src/lib/pricing/stripe-integration.ts`

### Step 9: Run Tests (TDD - GREEN)
- All tests should pass
- Verify coverage >90%

### Step 10: Performance Optimization
- Lazy load comparison table
- Optimize re-renders
- Test response times

### Step 11: Accessibility Audit
- Screen reader testing
- Keyboard navigation
- Color contrast verification

---

## 5. Acceptance Criteria (Checklist)

### Functional Requirements
- [ ] Page renders at `/pricing` route
- [ ] 4 pricing tiers displayed clearly
- [ ] Billing toggle (monthly/annual) working
- [ ] Prices update when billing changes
- [ ] "Most Popular" badge on Professional tier
- [ ] Pricing calculator functional
- [ ] Comparison table showing all features
- [ ] FAQ section with 8+ questions
- [ ] CTA buttons navigate correctly
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Dark mode works correctly

### Performance Requirements
- [ ] Response time <200ms (p95 <100ms, p99 <200ms)
- [ ] Lighthouse Performance ≥90
- [ ] Lighthouse Accessibility ≥90
- [ ] First Contentful Paint <1s
- [ ] Calculator updates <50ms

### Accessibility Requirements
- [ ] WCAG 2.1 AA compliant
- [ ] Keyboard navigation works
- [ ] Screen reader friendly
- [ ] Color contrast ≥4.5:1
- [ ] Proper ARIA labels
- [ ] Semantic HTML

### Code Quality Requirements
- [ ] TypeScript strict mode (no `any` types)
- [ ] ESLint passes with 0 warnings
- [ ] Prettier formatting applied
- [ ] Test coverage >90%
- [ ] All tests passing

### Documentation Requirements
- [ ] Pricing data in JSON file
- [ ] Component props documented
- [ ] Calculator logic documented
- [ ] Stripe integration mock prepared

---

## 6. Rollback Plan

If implementation fails:
1. Remove `(public)/pricing/` directory
2. Remove `components/pricing/` directory
3. Remove `pricing-data.json`
4. Remove `lib/pricing/` directory
5. Revert any package.json changes
6. Re-run tests to ensure no regressions

---

## 7. Dependencies

### Required Packages (Already Installed)
- `next@16.0.10`
- `react@19.2.3`
- `@intelliflow/ui` (workspace package)
- `tailwindcss@3.4.0`
- Testing libraries (from PG-002)

### New Dependencies (If Needed)
- None expected for MVP

---

## 8. Estimated Effort

- **Context Pack**: ✅ Complete (45 min)
- **Implementation Spec**: ✅ Complete (30 min)
- **Pricing Data**: ✅ Complete (15 min)
- **Tests**: 2.5 hours
- **Calculator Component**: 1.5 hours
- **Pricing Cards**: 1 hour
- **Comparison Table**: 1.5 hours
- **FAQ Section**: 1 hour
- **Page Integration**: 1 hour
- **Stripe Mock**: 30 min
- **Performance Optimization**: 1 hour
- **Accessibility Audit**: 30 min
- **Documentation**: 30 min

**Total**: ~11 hours for complete, production-ready implementation

---

## 9. Success Metrics

- ✅ All tests passing (`pnpm test`)
- ✅ Lighthouse score ≥90
- ✅ Response time <200ms
- ✅ Coverage >90%
- ✅ Zero ESLint warnings
- ✅ WCAG AA compliant
- ✅ Calculator updates <50ms

---

## 10. Next Steps

1. Write tests (TDD approach) ← **NEXT**
2. Create pricing components
3. Implement pricing page
4. Create mock Stripe integration
5. Run performance audit
6. Create attestation with evidence
