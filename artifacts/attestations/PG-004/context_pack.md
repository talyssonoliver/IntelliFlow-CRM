# PG-004: About Page - Context Pack

## Task Overview

**Task ID**: PG-004
**Task Name**: About Page Implementation
**Sprint**: 11
**Owner**: Growth FE (STOA-Foundation)
**Status**: In Progress
**Workflow**: TDD (Test-Driven Development)

## Dependencies

### Completed Dependencies
1. **PG-001** - Home Page (✅ Assumed completed)
2. **GTM-002** - Positioning & Messaging (✅ Completed - positioning.md exists)
3. **BRAND-001** - Visual Identity System (✅ Completed - visual-identity.md exists)

### Dependency Files Available
- ✅ `docs/company/messaging/positioning.md` - Brand positioning and messaging
- ✅ `docs/company/brand/visual-identity.md` - Brand colors, typography, icons
- ✅ `apps/web/src/app/(public)/features/page.tsx` - Reference for page structure
- ✅ `apps/web/src/app/(public)/pricing/page.tsx` - Reference for page patterns

## Requirements Analysis

### Definition of Done
- **Response Time**: <200ms (p99)
- **Lighthouse Score**: ≥90 (Performance, Accessibility, Best Practices, SEO)
- **Team Display**: Team members showcased with photos and bios
- **Company Story**: Compelling narrative about IntelliFlow CRM's mission
- **Culture Visibility**: Values, mission, and company culture clearly communicated

### KPIs (from Sprint Plan)
- "Story told, team showcased, culture visible"
- Page performance <200ms
- Lighthouse score ≥90
- All accessibility requirements met (WCAG 2.1 AA)

### Artifacts To Create
1. **apps/web/app/(public)/about/page.tsx** - Main About page component
2. **artifacts/misc/team-data.json** - Team member data (names, roles, photos, bios)
3. **docs/about/about-content.md** - Company story, mission, values, culture
4. **artifacts/attestations/PG-004/context_ack.json** - Context acknowledgment

## Company Positioning & Messaging

### One-Liner (from positioning.md)
> "IntelliFlow CRM is a modern, AI-first CRM that pairs automation with governance-grade validation so teams can move fast without losing control."

### Positioning Statement
> "For teams that need a lightweight CRM with real automation, IntelliFlow CRM provides a modern web stack, strong validation rules, and evidence-driven workflows—unlike traditional CRMs that accumulate manual admin and opaque processes."

### Key Pillars
1. **Automation with safeguards** - AI-powered automation without losing control
2. **Clear governance gates** - Validation and evidence-driven workflows
3. **Modern developer-friendly stack** - Built with modern technologies
4. **Observability and operational readiness** - Full visibility and monitoring

## Page Structure & Content

### 1. Hero Section
**Purpose**: Introduce the company and its mission

**Content**:
- **Heading**: "We're Building the Future of CRM"
- **Subheading**: "Modern, AI-first CRM that pairs automation with governance-grade validation"
- **Description**: Brief paragraph about the company's mission and vision
- **Badge**: "Founded in 2024" or similar timeline marker

**Design**:
- Gradient background: `from-white to-[#f6f7f8] dark:from-[#1e2936] dark:to-[#101922]`
- Large heading (text-4xl lg:text-5xl)
- Centered layout with max-w-6xl container

### 2. Mission & Vision Section
**Purpose**: Explain why IntelliFlow CRM exists

**Content**:
- **Our Mission**: Transform how teams manage customer relationships
- **Our Vision**: CRM that empowers teams without creating administrative burden
- **The Problem**: Traditional CRMs are slow, manual, and opaque
- **Our Solution**: Modern, AI-first approach with governance-grade validation

**Design**:
- Two-column layout (problem/solution or mission/vision)
- Icon for each subsection
- Neutral background (bg-slate-50 dark:bg-slate-900)

### 3. Core Values Section
**Purpose**: Communicate company values and culture

**Content** (suggested values aligned with positioning):
1. **Automation with Integrity** - AI-powered but always transparent
2. **Developer-First Thinking** - Modern stack, modern workflows
3. **Evidence-Driven Decisions** - Data and validation over assumptions
4. **Customer Success** - Building tools teams actually want to use

**Design**:
- Grid layout: 2x2 on desktop, 1 column on mobile
- Card-based with icons from Material Symbols Outlined
- Each value has: icon, title, description
- Hover effects with primary color (#137fec)

### 4. Team Section
**Purpose**: Showcase team members and build trust

**Content**:
- **Heading**: "Meet the Team" or "The People Behind IntelliFlow"
- **Subheading**: Brief intro about the team
- **Team Members**: Grid of team cards with:
  - Photo (circular avatar, 160px diameter)
  - Name
  - Role/Title
  - Brief bio (2-3 sentences)
  - Social links (LinkedIn, Twitter - optional for MVP)

**Design**:
- Grid layout: 3 columns (lg), 2 columns (md), 1 column (sm)
- Card-based design matching site aesthetic
- Circular photos with primary color ring on hover
- Consistent spacing and typography

### 5. Company Timeline (Optional - Good to Have)
**Purpose**: Show company journey and milestones

**Content**:
- **2024 Q1**: Founded IntelliFlow CRM
- **2024 Q2**: Built AI-powered lead scoring
- **2024 Q3**: Beta launch with pilot customers
- **2024 Q4**: Public launch

**Design**:
- Vertical timeline with dots and lines
- Each milestone as a card
- Icon for each milestone
- Optional for MVP (can be added later)

### 6. Call-to-Action Section
**Purpose**: Convert visitors into users

**Content**:
- **Heading**: "Ready to Transform Your Sales?"
- **Description**: "Join modern sales teams using IntelliFlow CRM"
- **Primary CTA**: "Start Free Trial" → /sign-up
- **Secondary CTA**: "Contact Sales" → /contact

**Design**:
- Gradient background: `from-[#137fec] to-[#0e6ac7]`
- White text on primary color background
- Two buttons: primary (white bg) + outline (white border)
- Full-width section

## Team Data Structure

### team-data.json Schema
```json
{
  "metadata": {
    "lastUpdated": "2025-12-30",
    "totalMembers": 4
  },
  "members": [
    {
      "id": "founder-1",
      "name": "Full Name",
      "role": "CEO & Co-Founder",
      "bio": "Brief biography (2-3 sentences) about background, expertise, and passion for CRM.",
      "photo": "/images/team/founder-1.jpg",
      "socialLinks": {
        "linkedin": "https://linkedin.com/in/...",
        "twitter": "https://twitter.com/..."
      }
    }
  ]
}
```

### Placeholder Team Members (for MVP)
Since this is MVP, we can use placeholder data:

1. **Alex Chen** - CEO & Co-Founder
   - Role: Product Vision & Strategy
   - Bio: "Former enterprise sales leader with 10+ years building and scaling B2B teams. Passionate about making CRM actually usable."

2. **Jordan Smith** - CTO & Co-Founder
   - Role: Engineering & AI Architecture
   - Bio: "Previously led AI/ML teams at tech companies. Believer in automation that augments, not replaces, human expertise."

3. **Riley Patel** - Head of Product
   - Role: Product Design & UX
   - Bio: "15 years designing enterprise software. Obsessed with building tools that teams love, not tolerate."

4. **Taylor Kim** - VP of Customer Success
   - Role: Customer Experience
   - Bio: "Career spent helping teams adopt new technology. Advocate for CRM that fits how teams actually work."

**Photo Strategy for MVP**:
- Option 1: Use placeholder avatars (initials on colored backgrounds)
- Option 2: Use stock photos (professional, diverse team)
- Option 3: Use https://ui-avatars.com/ API for generated avatars

## Brand Compliance

### Colors (from visual-identity.md)
- **Primary**: #137fec (main brand color)
- **Primary Hover**: #0e6ac7 (darker state)
- **Success**: #22c55e (positive accents)
- **Background Light**: #f6f7f8
- **Background Dark**: #101922
- **Surface Light**: #ffffff
- **Surface Dark**: #1e2936

### Typography
- **Font Family**: Inter, system-ui, sans-serif
- **H1**: 48px, Bold, line-height 1.25
- **H2**: 36px, Bold, line-height 1.25
- **H3**: 30px, Semibold, line-height 1.25
- **Body**: 16px, Regular, line-height 1.5
- **Small**: 14px, Regular, line-height 1.5

### Icons
- **Library**: Material Symbols Outlined only
- **Common Icons**:
  - `groups` - Team/people
  - `rocket_launch` - Mission/launch
  - `auto_awesome` - AI/intelligence
  - `verified` - Trust/validation
  - `workspace_premium` - Excellence/quality
  - `psychology` - Innovation/thinking
  - `shield` - Security/governance
  - `speed` - Performance/efficiency

### Spacing
- **Container**: max-w-7xl (1280px) for content, max-w-6xl for hero
- **Section Padding**: py-16 lg:py-24
- **Card Padding**: p-6 or p-8
- **Grid Gap**: gap-6 lg:gap-8

### Responsive Breakpoints
- **Mobile**: Default (< 640px)
- **Tablet**: md: (768px)
- **Desktop**: lg: (1024px)

## Accessibility Requirements (WCAG 2.1 AA)

### Color Contrast
- Normal text: 4.5:1 minimum
- Large text (18px+): 3:1 minimum
- All text on colored backgrounds must meet contrast requirements

### Semantic HTML
- Use semantic elements: `<section>`, `<article>`, `<header>`, `<nav>`
- Proper heading hierarchy: h1 → h2 → h3 (no skipping levels)
- Alt text for all images (team photos)

### Keyboard Navigation
- All interactive elements must be keyboard accessible
- Tab order should be logical (top to bottom, left to right)
- Focus indicators visible (2px ring, primary color)

### ARIA Labels
- `aria-label` on links: "Learn more about [feature]"
- `aria-label` on buttons when icon-only
- `alt` text on team photos: "[Name], [Role]"
- `aria-labelledby` for section headings

### Screen Reader Friendly
- Descriptive link text (no "click here")
- Alt text for decorative images can be empty (`alt=""`)
- Proper list markup (`<ul>`, `<li>`)

## Performance Requirements

### Core Web Vitals Targets
- **LCP (Largest Contentful Paint)**: <2.5s
- **FID (First Input Delay)**: <100ms
- **CLS (Cumulative Layout Shift)**: <0.1

### Optimization Strategies
1. **Image Optimization**:
   - Use Next.js Image component
   - WebP format with fallbacks
   - Lazy loading for below-fold images
   - Responsive images (srcset)

2. **Code Splitting**:
   - Dynamic imports for heavy components
   - Route-based code splitting (Next.js default)

3. **Fonts**:
   - Preload Inter font
   - Font display: swap

4. **Caching**:
   - Static generation (SSG) for About page
   - CDN caching headers

### Lighthouse Targets
- **Performance**: ≥90
- **Accessibility**: ≥90 (aim for 100)
- **Best Practices**: ≥90
- **SEO**: ≥90

## Testing Strategy

### Unit Tests (Vitest + @testing-library/react)
1. **Page Structure Tests** (10 tests)
   - Hero section renders with heading
   - Mission & Vision section renders
   - Values section renders with 4 values
   - Team section renders
   - CTA section renders

2. **Content Tests** (8 tests)
   - Company name appears in heading
   - Mission statement displays
   - All values have icons and descriptions
   - Team members display with names and roles
   - CTA buttons have correct href

3. **Accessibility Tests** (6 tests)
   - Heading hierarchy is correct (h1, h2, h3)
   - All images have alt text
   - Links have accessible labels
   - Focus indicators present
   - Color contrast meets WCAG 2.1 AA

4. **Responsive Design Tests** (4 tests)
   - Team grid is responsive (3 → 2 → 1 columns)
   - Values grid is responsive (2 → 1 columns)
   - Text sizes adjust for mobile
   - Spacing is consistent

5. **Dark Mode Tests** (2 tests)
   - Dark mode classes present
   - Text colors adapt for dark mode

6. **Data Validation Tests** (5 tests)
   - team-data.json structure is valid
   - All team members have required fields
   - Photo URLs are valid
   - Social links are valid URLs
   - Metadata is present

**Total**: ~35 tests

### Integration Tests
- Full page renders without errors
- All links navigate correctly
- Images load successfully

### E2E Tests (Playwright)
- User can navigate to About page
- User can click CTA buttons
- Page loads within performance budget
- Lighthouse audit passes

## Implementation Steps

### Step 1: Create Context Acknowledgment
- Read all context files
- Document invariants and constraints
- List all decisions made
- Identify any risks or open questions

### Step 2: Create Team Data
- Create `artifacts/misc/team-data.json` with team member data
- Use placeholder names, roles, bios for MVP
- Define photo strategy (placeholders or stock)

### Step 3: Create Content Document
- Create `docs/about/about-content.md` with:
  - Company story
  - Mission statement
  - Vision statement
  - Core values (4 values)
  - Team section intro

### Step 4: Write Tests FIRST (TDD RED)
- Write all 35 tests before implementing
- Tests should fail initially (RED phase)
- Cover all sections and requirements

### Step 5: Implement About Page Component
- Create `apps/web/app/(public)/about/page.tsx`
- Follow server component pattern (like features/pricing pages)
- Import team-data.json
- Implement all 6 sections
- Apply brand styling

### Step 6: Run Tests (TDD GREEN)
- Run tests: `pnpm test`
- All tests should pass
- Fix any failures
- Achieve >90% coverage

### Step 7: Performance Audit
- Run Lighthouse audit
- Ensure all scores ≥90
- Optimize if needed

### Step 8: Create Attestation
- Document completion with evidence
- Include test results
- Include Lighthouse scores
- List all files created

## Success Criteria

### Functional Requirements
- ✅ Page renders all 6 sections correctly
- ✅ Team members display with photos, names, roles, bios
- ✅ Company story and values are clear
- ✅ CTA buttons navigate correctly
- ✅ Dark mode support throughout

### Non-Functional Requirements
- ✅ Response time <200ms (p99)
- ✅ Lighthouse Performance ≥90
- ✅ Lighthouse Accessibility ≥90
- ✅ Test coverage >90%
- ✅ WCAG 2.1 AA compliance verified
- ✅ Mobile responsive (all breakpoints)

### Quality Gates
- ✅ All tests passing (35+ tests)
- ✅ No TypeScript errors
- ✅ No console warnings
- ✅ ESLint passing
- ✅ Prettier formatted
- ✅ Git hooks passing

## Risks & Mitigations

### Risk 1: Team Photos Not Available
- **Impact**: Medium - Affects visual appeal
- **Mitigation**: Use placeholder avatars with initials for MVP
- **Backup**: Use UI Avatars API or stock photos

### Risk 2: Company Story Not Finalized
- **Impact**: Medium - Content may need updates
- **Mitigation**: Use positioning statement as base, iterate later
- **Backup**: Keep content in JSON file for easy updates

### Risk 3: Coverage Below 90%
- **Impact**: Low - May delay attestation
- **Mitigation**: Write comprehensive tests upfront (TDD)
- **Backup**: Add tests for uncovered lines

## Design Reference

### Similar Pages for Pattern Reference
1. **Features Page** (PG-002) - Category sections with cards
2. **Pricing Page** (PG-003) - CTA section pattern
3. **Home Page** (PG-001) - Hero section pattern (assumed)

### External Inspiration
- **Linear.app/about** - Clean team section
- **Stripe.com/about** - Mission/values presentation
- **Vercel.com/about** - Modern, minimal approach

## Open Questions & Assumptions

### Questions
1. **Team size**: How many team members to show? (Assumed: 4 for MVP)
2. **Timeline**: Should we include company timeline? (Assumed: Optional, deferred)
3. **Photos**: Use real photos or placeholders? (Assumed: Placeholders for MVP)

### Assumptions
1. All dependencies (PG-001, GTM-002, BRAND-001) are completed
2. Company story is based on positioning.md
3. Team members are placeholder data for MVP
4. Photos will use placeholder avatars (initials)
5. Social links are optional for MVP
6. Timeline section is deferred to post-MVP
7. Server component (SSG) is appropriate (no client-side state needed)

## References

### Files Read
1. `docs/company/brand/visual-identity.md` - Brand colors, typography, icons
2. `docs/company/messaging/positioning.md` - Company positioning and pillars
3. `apps/web/src/app/(public)/features/page.tsx` - Page structure reference
4. `apps/web/src/app/(public)/pricing/page.tsx` - Page pattern reference
5. `Sprint_plan.csv` (line 122) - Task requirements and KPIs

### External Resources
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Symbols Outlined](https://fonts.google.com/icons)
- [Next.js Image Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/images)
- [Lighthouse Performance](https://developer.chrome.com/docs/lighthouse/)

---

**Context Pack Version**: 1.0
**Created**: 2025-12-30
**Author**: Claude Sonnet 4.5
**Status**: Ready for Implementation
