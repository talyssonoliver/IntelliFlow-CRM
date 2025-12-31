# PG-003: Pricing Page - Context Pack

**Task ID**: PG-003
**Run ID**: 20251230-011543-PG-003
**Sprint**: 11
**Status**: Planning
**Created**: 2025-12-30T01:15:43Z

---

## 1. Task Summary

Implement a conversion-optimized Pricing page at `/pricing` with clear pricing tiers, an interactive pricing calculator, and Stripe integration readiness.

**Key Requirements:**
- 3-4 pricing tiers (Starter, Professional, Enterprise, Custom)
- Interactive pricing calculator (annual vs monthly, user count selector)
- Comparison table showing features per tier
- Stripe integration preparation (no live payments yet)
- FAQ section addressing common pricing questions
- Clear CTAs for each tier

---

## 2. Context Analysis

### 2.1 Dependencies

**All dependencies completed:**
- ✅ **PG-001**: Home page (Backlog status, but referenced for layout patterns)
- ✅ **GTM-002**: Market research (DONE - positioning defined)
- ✅ **BRAND-001**: Visual identity (DONE - brand guidelines available)
- ✅ **Public Layout**: Created in PG-002 (PublicHeader, PublicFooter, layout.tsx)

### 2.2 Prerequisites Analysis

**From Sprint Plan:**
1. ✅ **docs/design/page-registry.md** - Page structure requirements
2. ✅ **docs/company/messaging/positioning.md** - Value proposition
3. ✅ **docs/company/brand/visual-identity.md** - Brand colors, typography
4. ✅ **docs/company/brand/style-guide.md** - Component patterns
5. ✅ **docs/company/brand/accessibility-patterns.md** - WCAG 2.1 AA compliance
6. ✅ **apps/web/app/(public)/page.tsx** - Reference for hero sections, CTAs
7. 📋 **POLICY: Pricing tiers defined** - Need to define tiers
8. 📋 **ENV: Calculator ready** - Need to build calculator component

### 2.3 Pricing Strategy

**Target Market** (from positioning.md):
- AI-first CRM for modern sales teams
- Focus on automation + governance-grade validation
- Competitive with traditional CRMs but premium AI features

**Proposed Pricing Tiers:**

#### Tier 1: Starter
- **Price**: £29/user/month (£24/user/month annual)
- **Target**: Small teams (1-5 users)
- **Features**:
  - Core CRM (contacts, deals, tasks)
  - Basic AI lead scoring
  - 1,000 AI predictions/month
  - Email support
  - Data retention: 1 year

#### Tier 2: Professional
- **Price**: £79/user/month (£65/user/month annual)
- **Target**: Growing teams (5-20 users)
- **Features**:
  - Everything in Starter
  - Advanced AI insights (churn prediction, LTV)
  - 10,000 AI predictions/month
  - Workflow automation
  - AI explainability dashboard
  - Priority support
  - Data retention: 3 years
  - API access

#### Tier 3: Enterprise
- **Price**: £199/user/month (£165/user/month annual)
- **Target**: Large teams (20+ users)
- **Features**:
  - Everything in Professional
  - Unlimited AI predictions
  - Custom AI model training
  - Multi-region deployment
  - SSO & advanced security
  - Zero-trust architecture
  - Dedicated account manager
  - SLA guarantee (99.9% uptime)
  - Data retention: Unlimited
  - White-label options

#### Tier 4: Custom
- **Price**: Contact Sales
- **Target**: Enterprise with special requirements
- **Features**:
  - Custom everything
  - On-premise deployment option
  - Dedicated infrastructure
  - Custom integrations
  - Legal review & contracts

### 2.4 Pricing Calculator Requirements

**User Inputs:**
1. **Billing Frequency**: Monthly vs Annual (show savings)
2. **User Count**: Slider or input (1-100+ users)
3. **Tier Selection**: Radio buttons or cards
4. **Add-ons** (optional for MVP):
   - Extra storage
   - Additional AI predictions
   - Premium support

**Calculator Logic:**
```typescript
// Annual discount: 17% off monthly price
const annualPrice = monthlyPrice * 0.83;
const totalMonthly = pricePerUser * userCount;
const totalAnnual = annualPrice * userCount * 12;
const savings = (totalMonthly * 12) - totalAnnual;
```

**Display:**
- Price per user/month
- Total monthly cost
- Total annual cost (if annual selected)
- Savings amount (if annual)
- Breakdown by feature category

### 2.5 Stripe Integration Preparation

**For MVP (PG-003):**
- No live payments - just prepare structure
- Price IDs defined (mock for now)
- Checkout flow designed (redirect to /sign-up with tier param)

**Future (Post-MVP):**
- Stripe Checkout integration
- Subscription management
- Billing portal
- Webhooks for subscription events

**Price IDs (Mock):**
```typescript
const stripePriceIds = {
  starter_monthly: 'price_starter_monthly',
  starter_annual: 'price_starter_annual',
  professional_monthly: 'price_professional_monthly',
  professional_annual: 'price_professional_annual',
  enterprise_monthly: 'price_enterprise_monthly',
  enterprise_annual: 'price_enterprise_annual',
};
```

---

## 3. Brand Compliance

**Colors** (from visual-identity.md):
- Primary: `#137fec`
- Primary Hover: `#0e6ac7`
- Success: `#10b981` (for "Most Popular" badge)
- Background Light: `#f6f7f8`
- Background Dark: `#101922`

**Typography** (Inter font):
- Pricing amounts: `text-4xl lg:text-5xl font-bold`
- Tier names: `text-2xl font-semibold`
- Feature lists: `text-base text-slate-600 dark:text-slate-400`

**Component Patterns:**
- Use `Card` component for pricing tiers
- Material Symbols Outlined icons for features
- Gradient backgrounds for CTAs
- Dark mode support for all elements

---

## 4. Page Structure

```tsx
<PricingPage>
  <HeroSection>
    - H1: "Simple, Transparent Pricing"
    - Subheading: Value proposition
    - Billing toggle: Monthly / Annual (show savings)
  </HeroSection>

  <PricingGrid>
    - 4 pricing cards (Starter, Professional, Enterprise, Custom)
    - Each card:
      - Tier name
      - Price (calculated from billing toggle)
      - Description
      - Feature list with checkmarks
      - CTA button
      - "Most Popular" badge for Professional
  </PricingGrid>

  <ComparisonTable>
    - Feature categories (rows)
    - Tiers (columns)
    - Checkmarks / values for each feature
  </ComparisonTable>

  <PricingCalculator>
    - User count slider
    - Tier selector
    - Real-time price calculation
    - "See your savings" messaging
  </PricingCalculator>

  <FAQSection>
    - Common questions:
      - "Can I change plans later?"
      - "What payment methods do you accept?"
      - "Do you offer discounts for nonprofits?"
      - "What's included in the Enterprise plan?"
      - "Is there a free trial?"
  </FAQSection>

  <CTASection>
    - "Ready to get started?"
    - Primary CTA: "Start Free Trial"
    - Secondary: "Contact Sales"
  </CTASection>
</PricingPage>
```

---

## 5. Data Structure

**File**: `apps/web/src/data/pricing-data.json`

```json
{
  "tiers": [
    {
      "id": "starter",
      "name": "Starter",
      "description": "Perfect for small teams getting started",
      "price": {
        "monthly": 29,
        "annual": 24
      },
      "features": [
        "Up to 5 users",
        "Core CRM features",
        "Basic AI lead scoring",
        "1,000 AI predictions/month",
        "Email support",
        "1 year data retention"
      ],
      "cta": "Start Free Trial",
      "mostPopular": false
    },
    {
      "id": "professional",
      "name": "Professional",
      "description": "For growing teams that need more power",
      "price": {
        "monthly": 79,
        "annual": 65
      },
      "features": [
        "Up to 20 users",
        "Everything in Starter",
        "Advanced AI insights",
        "10,000 AI predictions/month",
        "Workflow automation",
        "AI explainability",
        "Priority support",
        "3 years data retention",
        "API access"
      ],
      "cta": "Start Free Trial",
      "mostPopular": true
    },
    {
      "id": "enterprise",
      "name": "Enterprise",
      "description": "For large teams with advanced needs",
      "price": {
        "monthly": 199,
        "annual": 165
      },
      "features": [
        "Unlimited users",
        "Everything in Professional",
        "Unlimited AI predictions",
        "Custom AI model training",
        "Multi-region deployment",
        "SSO & advanced security",
        "99.9% SLA guarantee",
        "Dedicated account manager",
        "Unlimited data retention"
      ],
      "cta": "Contact Sales",
      "mostPopular": false
    },
    {
      "id": "custom",
      "name": "Custom",
      "description": "Tailored solutions for your unique needs",
      "price": {
        "monthly": null,
        "annual": null,
        "custom": true
      },
      "features": [
        "Custom everything",
        "On-premise deployment",
        "Dedicated infrastructure",
        "Custom integrations",
        "Legal review & contracts",
        "White-label options"
      ],
      "cta": "Contact Sales",
      "mostPopular": false
    }
  ],
  "comparisonFeatures": [
    {
      "category": "Core CRM",
      "features": [
        {"name": "Contacts & Companies", "starter": true, "professional": true, "enterprise": true},
        {"name": "Deals & Pipeline", "starter": true, "professional": true, "enterprise": true},
        {"name": "Tasks & Reminders", "starter": true, "professional": true, "enterprise": true},
        {"name": "Email Integration", "starter": true, "professional": true, "enterprise": true}
      ]
    },
    {
      "category": "AI & Automation",
      "features": [
        {"name": "AI Lead Scoring", "starter": "Basic", "professional": "Advanced", "enterprise": "Custom"},
        {"name": "AI Predictions/month", "starter": "1,000", "professional": "10,000", "enterprise": "Unlimited"},
        {"name": "Workflow Automation", "starter": false, "professional": true, "enterprise": true},
        {"name": "AI Explainability", "starter": false, "professional": true, "enterprise": true}
      ]
    },
    {
      "category": "Security & Compliance",
      "features": [
        {"name": "Data Encryption", "starter": true, "professional": true, "enterprise": true},
        {"name": "SSO", "starter": false, "professional": false, "enterprise": true},
        {"name": "Audit Logs", "starter": "Basic", "professional": "Advanced", "enterprise": "Complete"},
        {"name": "SLA Guarantee", "starter": false, "professional": false, "enterprise": "99.9%"}
      ]
    }
  ],
  "faqs": [
    {
      "question": "Can I change plans later?",
      "answer": "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately for upgrades, or at the end of your billing cycle for downgrades."
    },
    {
      "question": "What payment methods do you accept?",
      "answer": "We accept all major credit cards (Visa, Mastercard, Amex) and bank transfers for annual plans. Enterprise customers can arrange custom payment terms."
    },
    {
      "question": "Is there a free trial?",
      "answer": "Yes! All plans come with a 14-day free trial. No credit card required to start."
    },
    {
      "question": "Do you offer discounts for nonprofits?",
      "answer": "Yes, we offer a 20% discount for registered nonprofits and educational institutions. Contact sales for details."
    },
    {
      "question": "What's included in support?",
      "answer": "Starter plans include email support with 24-hour response time. Professional plans get priority support with 4-hour response. Enterprise customers get dedicated account managers and 1-hour SLA."
    }
  ],
  "metadata": {
    "currency": "GBP",
    "annualDiscountPercent": 17,
    "lastUpdated": "2025-12-30",
    "version": "1.0.0"
  }
}
```

---

## 6. Accessibility Requirements

**WCAG 2.1 AA Compliance:**
- ✅ Color contrast ≥4.5:1 for all text
- ✅ Pricing cards keyboard navigable
- ✅ Calculator controls have ARIA labels
- ✅ Billing toggle has proper role and state
- ✅ Comparison table has proper headers
- ✅ All interactive elements focusable
- ✅ Screen reader friendly descriptions

**Specific Patterns:**
```tsx
// Billing toggle
<button
  role="switch"
  aria-checked={isAnnual}
  aria-label="Switch to annual billing"
>
  Annual (Save 17%)
</button>

// Pricing calculator
<input
  type="range"
  min="1"
  max="100"
  aria-label="Number of users"
  aria-valuemin="1"
  aria-valuemax="100"
  aria-valuenow={userCount}
/>

// Comparison table
<table role="table" aria-label="Feature comparison">
  <thead>
    <tr>
      <th scope="col">Feature</th>
      <th scope="col">Starter</th>
      <th scope="col">Professional</th>
      <th scope="col">Enterprise</th>
    </tr>
  </thead>
</table>
```

---

## 7. Performance Targets

**KPIs from Sprint Plan:**
- Response time: <200ms (p99)
- Lighthouse Performance: ≥90
- Lighthouse Accessibility: ≥90
- First Contentful Paint: <1s
- Calculator responsiveness: <50ms

**Optimization Strategies:**
- Static pricing data (no API calls)
- Client-side calculator (instant updates)
- Lazy load comparison table
- Optimize images (use Next.js Image)
- Minimize JavaScript bundle

---

## 8. Testing Strategy

**Unit Tests:**
- Pricing calculations (monthly vs annual)
- User count validation
- Price formatting (£29/user/month)
- Feature list rendering
- FAQ accordion functionality

**Integration Tests:**
- Billing toggle updates all prices
- Calculator updates pricing cards
- CTA buttons navigate correctly
- Comparison table responsive

**E2E Tests:**
- Full pricing page load
- Calculator interaction flow
- Mobile responsive behavior
- Dark mode switching

**Coverage Target:** >90%

---

## 9. Stripe Integration (Future)

**For MVP:** Mock implementation only

**File**: `apps/web/src/lib/pricing/stripe-integration.ts`

```typescript
// Mock Stripe integration for PG-003
export const stripePriceIds = {
  starter_monthly: 'price_starter_monthly',
  starter_annual: 'price_starter_annual',
  professional_monthly: 'price_professional_monthly',
  professional_annual: 'price_professional_annual',
  enterprise_monthly: 'price_enterprise_monthly',
  enterprise_annual: 'price_enterprise_annual',
};

export function getStripePriceId(tier: string, billing: 'monthly' | 'annual') {
  const key = `${tier}_${billing}` as keyof typeof stripePriceIds;
  return stripePriceIds[key];
}

// Future: Real Stripe checkout
export async function redirectToCheckout(priceId: string, userCount: number) {
  // For now, redirect to sign-up with query params
  const params = new URLSearchParams({
    plan: priceId,
    users: userCount.toString(),
  });
  window.location.href = `/sign-up?${params}`;
}
```

---

## 10. Success Criteria

**Definition of Done:**
- ✅ Pricing page renders at `/pricing`
- ✅ 4 pricing tiers displayed clearly
- ✅ Billing toggle (monthly/annual) working
- ✅ Pricing calculator functional
- ✅ Comparison table showing all features
- ✅ FAQ section with 5+ questions
- ✅ CTA buttons navigate correctly
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Dark mode supported
- ✅ All tests passing (>90% coverage)
- ✅ Lighthouse ≥90 (Performance & Accessibility)
- ✅ Response time <200ms
- ✅ Stripe integration prepared (mock)

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pricing strategy unclear | High | Define tiers based on market research (GTM-002) |
| Calculator complexity | Medium | Start simple, iterate based on user feedback |
| Stripe integration delays | Low | Use mock for MVP, real integration in Phase 2 |
| Comparison table overwhelming | Medium | Use progressive disclosure, show key features first |
| Performance on mobile | Medium | Lazy load comparison table, optimize images |

---

## 12. Open Questions

1. ✅ **Pricing tiers**: Defined above (Starter, Professional, Enterprise, Custom)
2. ✅ **Annual discount**: 17% off monthly price
3. ✅ **User count limits**: Starter (5), Professional (20), Enterprise (unlimited)
4. 📋 **Free trial duration**: Assume 14 days (to confirm with GTM)
5. 📋 **Payment methods**: Credit card for MVP (add invoicing later)
6. 📋 **Currency**: GBP for now (multi-currency in Phase 2)

---

## 13. Next Steps

1. Create context acknowledgment JSON
2. Create implementation specification
3. Create pricing-data.json
4. Write unit tests (TDD)
5. Implement PricingPage component
6. Implement PricingCalculator component
7. Create mock Stripe integration file
8. Run tests and verify coverage
9. Performance audit (Lighthouse)
10. Create attestation

**Estimated Duration:** 6-8 hours for complete implementation
