# PG-004: About Page - Implementation Specification

## Overview

This specification provides detailed technical guidance for implementing the About Page (PG-004) following Test-Driven Development (TDD) principles.

## File Structure

```
apps/web/
├── src/app/(public)/about/
│   ├── page.tsx                 # Main About page component
│   └── __tests__/
│       └── page.test.tsx        # Page component tests (~30 tests)
├── src/data/
│   └── about-content.json       # About page content (OPTIONAL - can inline)
artifacts/misc/
├── team-data.json               # Team member data
└── __tests__/
    └── team-data.test.ts        # Data validation tests (~5 tests)
docs/about/
└── about-content.md             # Company story, mission, values documentation
```

## 1. Data Structures

### team-data.json

**Location**: `artifacts/misc/team-data.json`

```json
{
  "metadata": {
    "lastUpdated": "2025-12-30",
    "totalMembers": 4,
    "version": "1.0"
  },
  "members": [
    {
      "id": "alex-chen",
      "name": "Alex Chen",
      "role": "CEO & Co-Founder",
      "bio": "Former enterprise sales leader with 10+ years building and scaling B2B teams. Passionate about making CRM actually usable.",
      "photo": "https://ui-avatars.com/api/?name=Alex+Chen&size=256&background=137fec&color=fff&bold=true",
      "socialLinks": {
        "linkedin": "https://linkedin.com/in/alexchen",
        "twitter": "https://twitter.com/alexchen"
      }
    },
    {
      "id": "jordan-smith",
      "name": "Jordan Smith",
      "role": "CTO & Co-Founder",
      "bio": "Previously led AI/ML teams at tech companies. Believer in automation that augments, not replaces, human expertise.",
      "photo": "https://ui-avatars.com/api/?name=Jordan+Smith&size=256&background=137fec&color=fff&bold=true",
      "socialLinks": {
        "linkedin": "https://linkedin.com/in/jordansmith",
        "twitter": "https://twitter.com/jordansmith"
      }
    },
    {
      "id": "riley-patel",
      "name": "Riley Patel",
      "role": "Head of Product",
      "bio": "15 years designing enterprise software. Obsessed with building tools that teams love, not tolerate.",
      "photo": "https://ui-avatars.com/api/?name=Riley+Patel&size=256&background=137fec&color=fff&bold=true",
      "socialLinks": {
        "linkedin": "https://linkedin.com/in/rileypatel",
        "twitter": "https://twitter.com/rileypatel"
      }
    },
    {
      "id": "taylor-kim",
      "name": "Taylor Kim",
      "role": "VP of Customer Success",
      "bio": "Career spent helping teams adopt new technology. Advocate for CRM that fits how teams actually work.",
      "photo": "https://ui-avatars.com/api/?name=Taylor+Kim&size=256&background=137fec&color=fff&bold=true",
      "socialLinks": {
        "linkedin": "https://linkedin.com/in/taylorkim",
        "twitter": "https://twitter.com/taylorkim"
      }
    }
  ]
}
```

### about-content.md (Documentation)

**Location**: `docs/about/about-content.md`

This file documents the company story, mission, vision, and values. It serves as the source of truth for About page content.

```markdown
# IntelliFlow CRM - About Content

## Company Story

IntelliFlow CRM was founded in 2024 to solve a problem every growing team faces: traditional CRMs create more work than they eliminate. We saw teams drowning in manual data entry, opaque AI "black boxes," and processes that slow them down instead of speeding them up.

We believe CRM should be intelligent automation with clear governance—not just another tool that requires a full-time admin.

## Mission

Our mission is to transform how teams manage customer relationships by providing modern, AI-first CRM that pairs automation with governance-grade validation, so teams can move fast without losing control.

## Vision

We envision a future where CRM systems augment human expertise rather than replace it, where automation is transparent and trustworthy, and where teams spend their time building relationships instead of updating databases.

## Core Values

### 1. Automation with Integrity
We believe in AI-powered automation, but always with transparency. Every AI decision includes an explanation, confidence score, and human override capability.

### 2. Developer-First Thinking
We build with modern technologies and developer-friendly workflows. Our stack is open, observable, and designed for teams that value quality code.

### 3. Evidence-Driven Decisions
We don't guess—we measure. Every feature includes metrics, every process has validation gates, and every decision is backed by data.

### 4. Customer Success
We build tools teams actually want to use, not tolerate. Our success is measured by how much time we save our customers, not how many features we ship.
```

## 2. Component Architecture

### AboutPage Component

**Type**: Server Component (Next.js App Router, SSG)
**File**: `apps/web/src/app/(public)/about/page.tsx`

**Structure**:
```tsx
// 1. Imports
import Link from 'next/link';
import { Button, Card } from '@intelliflow/ui';
import teamData from '@/../../artifacts/misc/team-data.json';

// 2. Metadata (SEO)
export const metadata = {
  title: 'About Us | IntelliFlow CRM',
  description: 'Learn about IntelliFlow CRM\'s mission to build modern, AI-first CRM with governance-grade validation.'
};

// 3. Main Component
export default function AboutPage() {
  return (
    <>
      <HeroSection />
      <MissionVisionSection />
      <CoreValuesSection />
      <TeamSection />
      <CTASection />
    </>
  );
}

// 4. Section Components (inline or separate)
// All sections implemented as JSX within the main component
```

**Component Pattern**: Server component with inline section JSX (similar to features/pricing pages).

## 3. Styling Specification

### Color Palette
```css
Primary:         #137fec
Primary Hover:   #0e6ac7
Success:         #22c55e
Background:      #f6f7f8 (light), #101922 (dark)
Surface:         #ffffff (light), #1e2936 (dark)
Text Primary:    text-slate-900 dark:text-white
Text Secondary:  text-slate-600 dark:text-slate-400
```

### Section Layouts

#### 1. Hero Section
```tsx
<section className="bg-gradient-to-b from-white to-[#f6f7f8] dark:from-[#1e2936] dark:to-[#101922] py-16 lg:py-24">
  <div className="container px-4 lg:px-6 mx-auto max-w-6xl">
    <div className="text-center max-w-3xl mx-auto">
      <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-6">
        We're Building the Future of CRM
      </h1>
      <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
        Modern, AI-first CRM that pairs automation with governance-grade validation
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-full">
        <span className="material-symbols-outlined text-[#137fec] text-sm">rocket_launch</span>
        <span className="text-sm font-medium text-[#137fec]">Founded in 2024</span>
      </div>
    </div>
  </div>
</section>
```

#### 2. Mission & Vision Section
```tsx
<section className="py-16 lg:py-24">
  <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
      {/* Mission Card */}
      <Card className="p-8">
        <div className="w-12 h-12 bg-[#137fec]/10 rounded-lg flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-2xl text-[#137fec]">auto_awesome</span>
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-3">Our Mission</h2>
        <p className="text-base text-slate-600 dark:text-slate-400">...</p>
      </Card>

      {/* Vision Card */}
      <Card className="p-8">...</Card>
    </div>
  </div>
</section>
```

#### 3. Core Values Section
```tsx
<section className="py-16 lg:py-24 bg-slate-50 dark:bg-slate-900">
  <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
    <div className="text-center max-w-3xl mx-auto mb-12">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Our Core Values</h2>
      <p className="text-base text-slate-600 dark:text-slate-400">The principles that guide everything we build</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
      {/* Value cards - 4 total */}
      <Card className="p-6 hover:border-[#137fec] hover:shadow-lg transition-all">
        <div className="w-12 h-12 bg-[#137fec]/10 rounded-lg flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-2xl text-[#137fec]">{icon}</span>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
        <p className="text-base text-slate-600 dark:text-slate-400">{description}</p>
      </Card>
    </div>
  </div>
</section>
```

#### 4. Team Section
```tsx
<section className="py-16 lg:py-24">
  <div className="container px-4 lg:px-6 mx-auto max-w-7xl">
    <div className="text-center max-w-3xl mx-auto mb-12">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">Meet the Team</h2>
      <p className="text-base text-slate-600 dark:text-slate-400">The people building the future of CRM</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
      {teamData.members.map((member) => (
        <Card key={member.id} className="p-6 text-center">
          {/* Circular photo */}
          <div className="w-32 h-32 rounded-full overflow-hidden mx-auto mb-4 ring-2 ring-[#137fec]/20">
            <img
              src={member.photo}
              alt={`${member.name}, ${member.role}`}
              className="w-full h-full object-cover"
            />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{member.name}</h3>
          <p className="text-sm text-[#137fec] mb-3">{member.role}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{member.bio}</p>

          {/* Social links */}
          <div className="flex items-center justify-center gap-2">
            {member.socialLinks.linkedin && (
              <a href={member.socialLinks.linkedin} className="text-slate-600 hover:text-[#137fec]" aria-label={`${member.name} on LinkedIn`}>
                <span className="material-symbols-outlined text-xl">work</span>
              </a>
            )}
            {member.socialLinks.twitter && (
              <a href={member.socialLinks.twitter} className="text-slate-600 hover:text-[#137fec]" aria-label={`${member.name} on Twitter`}>
                <span className="material-symbols-outlined text-xl">tag</span>
              </a>
            )}
          </div>
        </Card>
      ))}
    </div>
  </div>
</section>
```

#### 5. CTA Section
```tsx
<section className="py-16 lg:py-24 bg-gradient-to-r from-[#137fec] to-[#0e6ac7]" data-testid="cta-section">
  <div className="container px-4 lg:px-6 mx-auto max-w-4xl text-center">
    <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
      Ready to Transform Your Sales?
    </h2>
    <p className="text-lg text-white/90 mb-8">
      Join modern sales teams using IntelliFlow CRM. Start your free 14-day trial today.
    </p>
    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
      <Button asChild size="lg" className="bg-white text-[#137fec] hover:bg-white/90 min-w-[200px]">
        <Link href="/sign-up">Start Free Trial</Link>
      </Button>
      <Button asChild variant="outline" size="lg" className="border-white text-white hover:bg-white/10 min-w-[200px]">
        <Link href="/contact">Contact Sales</Link>
      </Button>
    </div>
  </div>
</section>
```

## 4. TDD Test Plan

### Test File 1: page.test.tsx (~30 tests)

**Location**: `apps/web/src/app/(public)/about/__tests__/page.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AboutPage from '../page';
import teamData from '@/../../artifacts/misc/team-data.json';

describe('AboutPage', () => {
  describe('Page Structure', () => {
    it('should render the hero section with correct heading', () => {
      // Test that hero h1 exists and contains "Future of CRM"
    });

    it('should display company tagline', () => {
      // Test subheading text
    });

    it('should show founding year badge', () => {
      // Test "Founded in 2024" badge
    });

    it('should render mission & vision section', () => {
      // Test mission/vision cards exist
    });

    it('should render core values section', () => {
      // Test 4 value cards exist
    });

    it('should render team section', () => {
      // Test team heading and grid
    });

    it('should render CTA section', () => {
      // Test CTA section with buttons
    });
  });

  describe('Mission & Vision Content', () => {
    it('should display mission statement', () => {
      // Test "Our Mission" heading and content
    });

    it('should display vision statement', () => {
      // Test "Our Vision" heading and content
    });

    it('should have icons for mission and vision', () => {
      // Test Material Symbols icons present
    });
  });

  describe('Core Values', () => {
    it('should render exactly 4 core values', () => {
      // Test 4 value cards exist
    });

    it('should display "Automation with Integrity" value', () => {
      // Test first value
    });

    it('should display "Developer-First Thinking" value', () => {
      // Test second value
    });

    it('should display "Evidence-Driven Decisions" value', () => {
      // Test third value
    });

    it('should display "Customer Success" value', () => {
      // Test fourth value
    });

    it('should have unique icons for each value', () => {
      // Test icons are different
    });

    it('should have hover effects on value cards', () => {
      // Test hover classes present
    });
  });

  describe('Team Section', () => {
    it('should render all team members from team-data.json', () => {
      // Test teamData.members.length cards exist
    });

    it('should display team member names', () => {
      // Test all names appear
    });

    it('should display team member roles', () => {
      // Test all roles appear
    });

    it('should display team member bios', () => {
      // Test all bios appear
    });

    it('should have circular photos for all team members', () => {
      // Test images with alt text
    });

    it('should show social links for team members', () => {
      // Test LinkedIn and Twitter links
    });

    it('should have correct alt text for team photos', () => {
      // Test alt format: "{Name}, {Role}"
    });
  });

  describe('CTA Section', () => {
    it('should render CTA heading', () => {
      // Test "Ready to Transform Your Sales?"
    });

    it('should have "Start Free Trial" button', () => {
      // Test button exists with correct href
    });

    it('should have "Contact Sales" button', () => {
      // Test button exists with correct href
    });

    it('should link to /sign-up', () => {
      // Test trial button href="/sign-up"
    });

    it('should link to /contact', () => {
      // Test sales button href="/contact"
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      // Test h1 → h2 → h3 order
    });

    it('should have alt text for all images', () => {
      // Test team photos have alt text
    });

    it('should have accessible link labels', () => {
      // Test aria-label on social links
    });

    it('should support keyboard navigation', () => {
      // Test tabindex not -1
    });

    it('should have proper color contrast', () => {
      // Test text colors meet WCAG
    });

    it('should have ARIA labels on icon-only links', () => {
      // Test social link ARIA labels
    });
  });

  describe('Responsive Design', () => {
    it('should have responsive grid for values', () => {
      // Test md:grid-cols-2 class
    });

    it('should have responsive grid for team', () => {
      // Test lg:grid-cols-4 class
    });

    it('should use responsive text sizes', () => {
      // Test text-4xl lg:text-5xl
    });
  });

  describe('Dark Mode', () => {
    it('should have dark mode variants for backgrounds', () => {
      // Test dark: classes
    });

    it('should have dark mode variants for text', () => {
      // Test dark:text- classes
    });
  });

  describe('Brand Consistency', () => {
    it('should use IntelliFlow primary color (#137fec)', () => {
      // Test #137fec usage
    });

    it('should use Material Symbols Outlined icons', () => {
      // Test .material-symbols-outlined classes
    });
  });
});
```

### Test File 2: team-data.test.ts (~5 tests)

**Location**: `artifacts/misc/__tests__/team-data.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import teamData from '../team-data.json';

describe('Team Data Validation', () => {
  it('should have valid metadata', () => {
    expect(teamData.metadata).toBeDefined();
    expect(teamData.metadata.totalMembers).toBe(4);
    expect(teamData.metadata.lastUpdated).toBeDefined();
  });

  it('should have exactly 4 team members', () => {
    expect(teamData.members).toHaveLength(4);
  });

  it('should have required fields for each member', () => {
    teamData.members.forEach(member => {
      expect(member.id).toBeDefined();
      expect(member.name).toBeDefined();
      expect(member.role).toBeDefined();
      expect(member.bio).toBeDefined();
      expect(member.photo).toBeDefined();
    });
  });

  it('should have valid photo URLs', () => {
    teamData.members.forEach(member => {
      expect(member.photo).toMatch(/^https?:\/\//);
    });
  });

  it('should have non-empty bios', () => {
    teamData.members.forEach(member => {
      expect(member.bio.length).toBeGreaterThan(50);
    });
  });
});
```

## 5. Implementation Steps

### Step 1: Create Data Files
1. Create `artifacts/misc/team-data.json` with 4 team members
2. Create `docs/about/about-content.md` with company story
3. Validate data structure

### Step 2: Write Tests FIRST (TDD RED)
1. Create `apps/web/src/app/(public)/about/__tests__/page.test.tsx`
2. Write all ~30 page tests
3. Create `artifacts/misc/__tests__/team-data.test.ts`
4. Write all ~5 data tests
5. Run tests - should FAIL (RED phase)

### Step 3: Implement Page Component
1. Create `apps/web/src/app/(public)/about/page.tsx`
2. Add metadata for SEO
3. Implement Hero Section
4. Implement Mission & Vision Section
5. Implement Core Values Section
6. Implement Team Section
7. Implement CTA Section
8. Import and use team-data.json

### Step 4: Run Tests (TDD GREEN)
1. Run `pnpm test`
2. All tests should PASS (GREEN phase)
3. Fix any failing tests
4. Verify coverage >90%

### Step 5: Performance Validation
1. Run dev server: `pnpm dev`
2. Open `/about` page
3. Run Lighthouse audit
4. Verify all scores ≥90
5. Optimize if needed

### Step 6: Accessibility Validation
1. Run axe DevTools audit
2. Verify zero violations
3. Test keyboard navigation
4. Verify screen reader compatibility

### Step 7: Create Attestation
1. Document completion
2. Include test results
3. Include Lighthouse scores
4. List all files created

## 6. Acceptance Criteria

### Functional Requirements
- ✅ Hero section with company tagline
- ✅ Mission & Vision cards
- ✅ 4 Core Values displayed
- ✅ 4 Team members with photos, names, roles, bios
- ✅ Social links for team members (LinkedIn, Twitter)
- ✅ CTA section with 2 buttons
- ✅ All links navigate correctly
- ✅ Dark mode support throughout

### Non-Functional Requirements
- ✅ Response time <200ms (p99)
- ✅ Lighthouse Performance ≥90
- ✅ Lighthouse Accessibility ≥90
- ✅ Lighthouse Best Practices ≥90
- ✅ Lighthouse SEO ≥90
- ✅ Test coverage >90%
- ✅ All ~35 tests passing
- ✅ WCAG 2.1 AA compliance
- ✅ Mobile responsive (all breakpoints)

### Code Quality
- ✅ Zero TypeScript errors
- ✅ Zero ESLint warnings
- ✅ Prettier formatted
- ✅ Git hooks passing
- ✅ Proper component structure
- ✅ Type-safe imports

## 7. Key Icons

```typescript
const icons = {
  hero: 'rocket_launch',
  mission: 'auto_awesome',
  vision: 'visibility',
  values: {
    automation: 'verified',
    developer: 'code',
    evidence: 'analytics',
    customer: 'favorite'
  },
  team: 'groups',
  social: {
    linkedin: 'work',
    twitter: 'tag'
  }
};
```

## 8. SEO Metadata

```typescript
export const metadata = {
  title: 'About Us - Modern AI-First CRM | IntelliFlow',
  description: 'Learn about IntelliFlow CRM\'s mission to build modern, AI-first CRM with governance-grade validation. Meet our team and discover our values.',
  keywords: 'about IntelliFlow, CRM team, AI-first CRM, company mission, company values',
  openGraph: {
    title: 'About IntelliFlow CRM',
    description: 'Modern, AI-first CRM that pairs automation with governance-grade validation',
    type: 'website',
  }
};
```

## 9. Performance Optimization

### Image Optimization
- Use UI Avatars API (lightweight SVG)
- No need for Next.js Image component (external API)
- Loading attribute: `loading="lazy"` for below-fold

### Code Splitting
- Server component (no client-side JS)
- Static generation (SSG)

### Fonts
- Inter already loaded globally
- Material Symbols loaded in layout

## 10. Testing Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test -- --coverage

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

---

**Implementation Spec Version**: 1.0
**Created**: 2025-12-30
**Author**: Claude Sonnet 4.5
**Status**: Ready for TDD Implementation
