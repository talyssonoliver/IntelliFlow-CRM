# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.
### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

## PG-012 – Career Detail Page

**Sprint:** 12
**Section:** Public Pages
**Owner:** Growth FE (STOA-Foundation)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- PG-011 (DONE) - Careers Index Page
- GTM-002 (DONE) - SEO & Analytics Setup
- BRAND-001 (DONE) - Brand Foundation

Dependency Status:
- PG-011 (DONE)
- GTM-002 (DONE)
- BRAND-001 (DONE)

### Pre-requisites
FILE:docs/design/page-registry.md;FILE:artifacts/sprint0/codex-run/Framework.md;FILE:audit-matrix.yml;ENV:Job description template;POLICY:requirements clear;FILE:apps/web/app/(public)/careers/page.tsx;FILE:docs/company/messaging/positioning.md;FILE:docs/company/brand/visual-identity.md;FILE:docs/company/brand/style-guide.md;FILE:docs/company/brand/dos-and-donts.md;FILE:docs/company/brand/accessibility-patterns.md

### Definition of Done
1. Response <200ms, Lighthouse ≥90, apply button working
2. artifacts: page.tsx, job-detail-template.tsx, apply-button.tsx

### Artifacts to Track
- ARTIFACT:apps/web/app/(public)/careers/[id]/page.tsx
- ARTIFACT:apps/web/components/shared/job-detail-template.tsx
- ARTIFACT:apps/web/components/shared/apply-button.tsx
- EVIDENCE:artifacts/attestations/PG-012/context_ack.json

### Validation
AUDIT:manual-review;GATE:lighthouse-gte-90

### Brand / UX / Flows References
- Brand: docs/company/brand/style-guide.md
- Page Registry: docs/design/page-registry.md
- Sitemap: docs/design/sitemap.md
- Check the relevant Flows: apps/project-tracker/docs/metrics/_global/flows/

### Context Controls
- Build context pack and context ack before coding.
- Evidence folder: artifacts/attestations/<task_id>/
- Use spec/plan if present under .specify/.

---

## Brand Design System Context

### Color Palette

**Primary Colors:**
| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#137fec` | Primary buttons, links, active states, department badges |
| `primary-hover` | `#0e6ac7` | Hover states for primary elements |
| `primary-light` | `#e8f4fd` | Light backgrounds, badge backgrounds |
| `accent-light` | `#7cc4ff` | Focus rings, decorative accents |

**Neutral Colors:**
| Token | Hex | Usage |
|-------|-----|-------|
| `slate-900` | `#0f172a` | Primary text, headings, hero background |
| `slate-800` | `#1e293b` | Dark mode surfaces |
| `slate-700` | `#334155` | Secondary text |
| `slate-600` | `#475569` | Body text |
| `slate-500` | `#64748b` | Muted text, metadata |
| `slate-400` | `#94a3b8` | Dark mode muted text |
| `slate-300` | `#cbd5e1` | Borders in dark mode |
| `slate-200` | `#e2e8f0` | Borders, dividers |
| `slate-100` | `#f1f5f9` | Light backgrounds |
| `slate-50` | `#f8fafc` | Page backgrounds |

**Semantic Colors:**
| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#10b981` | Check icons, success states |
| `success-light` | `green-100/green-900` | Success background (light/dark) |
| `warning` | `#f59e0b` | Warning states |
| `error` | `#ef4444` | Required field indicators, errors |

**Dark Mode:**
- Background: `slate-900` (#0f172a)
- Surface: `slate-800` (#1e293b)
- Text: `slate-100` (#f1f5f9)
- Muted: `slate-400` (#94a3b8)

### Typography

**Font Family:** Inter (sans-serif)

**Headings:**
| Element | Size | Weight | Line Height | Usage |
|---------|------|--------|-------------|-------|
| H1 | 2.25rem (36px) | 700 (bold) | 1.2 | Job title |
| H2 | 1.5rem (24px) | 600 (semibold) | 1.25 | Section headings |
| H3 | 1.25rem (20px) | 600 (semibold) | 1.3 | Subsection headings |
| H4 | 1.125rem (18px) | 500 (medium) | 1.4 | Card titles |

**Body Text:**
| Variant | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Large | 1.125rem (18px) | 400 | 1.75 |
| Base | 1rem (16px) | 400 | 1.6 |
| Small | 0.875rem (14px) | 400 | 1.5 |
| XSmall | 0.75rem (12px) | 400 | 1.4 |

### Spacing System (Base-4)

| Token | Value | Usage |
|-------|-------|-------|
| `spacing-1` | 4px | Icon gaps |
| `spacing-2` | 8px | Small gaps, inline elements |
| `spacing-3` | 12px | Medium gaps |
| `spacing-4` | 16px | Standard component padding |
| `spacing-6` | 24px | Section padding |
| `spacing-8` | 32px | Large section gaps |
| `spacing-12` | 48px | Page section margins |
| `spacing-16` | 64px | Major section breaks |

### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 4px | Small elements |
| `rounded` | 6px | Buttons, inputs |
| `rounded-md` | 8px | Cards, panels |
| `rounded-lg` | 12px | Large cards, modals |
| `rounded-full` | 9999px | Pills, badges, avatars |

---

## Job Data Structure

Reference data structure from `artifacts/misc/job-listings.json`:

```typescript
interface JobListing {
  id: string;                  // URL-friendly slug (e.g., "sr-fullstack-eng")
  title: string;               // Job title (e.g., "Senior Full-Stack Engineer")
  department: string;          // Department name (e.g., "Engineering")
  location: string;            // Location (e.g., "Remote (UK/EU)")
  type: string;                // Employment type (e.g., "Full-time")
  salary_range?: string;       // Salary range (e.g., "90000-130000 GBP")
  posted_at: string;           // ISO date string (e.g., "2025-12-15")
  description: string;         // Short description
  requirements: string[];      // Required qualifications
  nice_to_have?: string[];     // Optional/preferred qualifications
  status: 'open' | 'closed';   // Job status
}
```

**Current Open Positions:**
1. Senior Full-Stack Engineer (Engineering) - Remote UK/EU
2. AI/ML Engineer (AI & Intelligence) - Remote Global
3. Product Designer (Design) - London, UK
4. Developer Relations Engineer (Developer Experience) - Remote US/EU
5. Security Engineer (Platform) - Remote UK/EU

---

## Component Patterns

### Job Detail Template Structure
```html
<article class="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
  <!-- Header Section -->
  <div class="p-6 lg:p-8 border-b border-slate-200 dark:border-slate-700">
    <!-- Breadcrumb -->
    <nav aria-label="Breadcrumb" class="mb-4">
      <ol class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <li><a href="/" class="hover:text-primary">Home</a></li>
        <li>/</li>
        <li><a href="/careers" class="hover:text-primary">Careers</a></li>
        <li>/</li>
        <li class="text-slate-900 dark:text-white">{job.title}</li>
      </ol>
    </nav>

    <!-- Department Badge -->
    <span class="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary mb-4">
      {job.department}
    </span>

    <!-- Title -->
    <h1 class="text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-4">
      {job.title}
    </h1>

    <!-- Metadata -->
    <div class="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
      <span class="inline-flex items-center gap-1.5">
        <span class="material-symbols-outlined text-base text-slate-400" aria-hidden="true">location_on</span>
        {job.location}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="material-symbols-outlined text-base text-slate-400" aria-hidden="true">schedule</span>
        {job.type}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span class="material-symbols-outlined text-base text-slate-400" aria-hidden="true">calendar_today</span>
        Posted {formatDate(job.posted_at)}
      </span>
      {job.salary_range && (
        <span class="inline-flex items-center gap-1.5">
          <span class="material-symbols-outlined text-base text-slate-400" aria-hidden="true">payments</span>
          {job.salary_range}
        </span>
      )}
    </div>
  </div>

  <!-- Content Section -->
  <div class="p-6 lg:p-8 space-y-8">
    <!-- About the Role -->
    <section>
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-4">
        About the Role
      </h2>
      <p class="text-slate-600 dark:text-slate-300 leading-relaxed">
        {job.description}
      </p>
    </section>

    <!-- Requirements -->
    <section>
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-4">
        Requirements
      </h2>
      <ul class="space-y-3">
        {job.requirements.map(req => (
          <li class="flex items-start gap-3 text-slate-600 dark:text-slate-300">
            <span class="material-symbols-outlined text-lg text-primary mt-0.5" aria-hidden="true">check_circle</span>
            <span>{req}</span>
          </li>
        ))}
      </ul>
    </section>

    <!-- Nice to Have -->
    {job.nice_to_have && (
      <section>
        <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-4">
          Nice to Have
        </h2>
        <ul class="space-y-3">
          {job.nice_to_have.map(item => (
            <li class="flex items-start gap-3 text-slate-600 dark:text-slate-300">
              <span class="material-symbols-outlined text-lg text-slate-400 mt-0.5" aria-hidden="true">add_circle</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    )}

    <!-- What We Offer -->
    <section>
      <h2 class="text-xl font-semibold text-slate-900 dark:text-white mb-4">
        What We Offer
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Benefits cards -->
      </div>
    </section>
  </div>
</article>
```

### Apply Button Component
```tsx
// apps/web/src/components/shared/apply-button.tsx
'use client';

import { useState } from 'react';

interface ApplyButtonProps {
  jobId: string;
  jobTitle: string;
  variant?: 'primary' | 'fixed';
  className?: string;
}

export function ApplyButton({ jobId, jobTitle, variant = 'primary', className }: ApplyButtonProps) {
  // Primary variant (in-page)
  if (variant === 'primary') {
    return (
      <a
        href={`#apply-form`}
        className={`
          inline-flex items-center justify-center gap-2
          px-8 py-3 rounded-lg
          bg-[#137fec] text-white font-semibold
          hover:bg-[#0e6ac7] transition-colors
          focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2
          ${className}
        `}
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">
          send
        </span>
        Apply for this Role
      </a>
    );
  }

  // Fixed variant (sticky button on mobile)
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 lg:hidden z-40">
      <a
        href={`#apply-form`}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-colors"
      >
        Apply Now
      </a>
    </div>
  );
}
```

### Department Badge Pattern
```html
<!-- Department badges with consistent styling -->
<span class="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-[#137fec]/10 text-[#137fec]">
  Engineering
</span>

<!-- Alternative: muted badge for secondary info -->
<span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
  Full-time
</span>
```

### Metadata Item Pattern
```html
<span class="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-300">
  <span class="material-symbols-outlined text-base text-slate-400" aria-hidden="true">location_on</span>
  Remote (UK/EU)
</span>
```

### Requirements List Pattern
```html
<ul class="space-y-3" role="list">
  <li class="flex items-start gap-3">
    <span class="material-symbols-outlined text-lg text-[#137fec] mt-0.5 flex-shrink-0" aria-hidden="true">
      check_circle
    </span>
    <span class="text-slate-600 dark:text-slate-300">
      5+ years full-stack experience
    </span>
  </li>
</ul>
```

### Nice-to-Have List Pattern
```html
<ul class="space-y-3" role="list">
  <li class="flex items-start gap-3">
    <span class="material-symbols-outlined text-lg text-slate-400 mt-0.5 flex-shrink-0" aria-hidden="true">
      add_circle
    </span>
    <span class="text-slate-600 dark:text-slate-300">
      Experience with AI/ML integrations
    </span>
  </li>
</ul>
```

### Benefit Card Pattern (from Careers Index)
```html
<div class="flex items-start gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
  <div class="w-10 h-10 rounded-lg bg-[#137fec]/10 flex items-center justify-center flex-shrink-0">
    <span class="material-symbols-outlined text-xl text-[#137fec]" aria-hidden="true">
      home
    </span>
  </div>
  <div>
    <h3 class="font-semibold text-slate-900 dark:text-white">
      Remote-First
    </h3>
    <p class="text-sm text-slate-600 dark:text-slate-300">
      Work from anywhere. We trust our team to deliver without micromanagement.
    </p>
  </div>
</div>
```

### Form Input Pattern
```html
<div>
  <label for="firstName" class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
    First Name <span class="text-red-500">*</span>
  </label>
  <input
    id="firstName"
    name="firstName"
    type="text"
    required
    class="w-full px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#137fec] focus:border-transparent"
    placeholder="Jane"
  />
</div>
```

### Submit Button Pattern
```html
<button
  type="submit"
  disabled={isSubmitting}
  class="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#137fec] text-white font-semibold hover:bg-[#0e6ac7] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7cc4ff] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
>
  {isSubmitting ? (
    <>
      <span class="material-symbols-outlined animate-spin text-lg" aria-hidden="true">progress_activity</span>
      Submitting...
    </>
  ) : (
    <>
      <span class="material-symbols-outlined text-lg" aria-hidden="true">send</span>
      Submit Application
    </>
  )}
</button>
```

---

## Accessibility Requirements (WCAG 2.1 AA)

### Semantic Structure
```html
<!-- Main article with proper heading hierarchy -->
<main id="main-content">
  <article aria-labelledby="job-title">
    <h1 id="job-title">Senior Full-Stack Engineer</h1>

    <section aria-labelledby="requirements-heading">
      <h2 id="requirements-heading">Requirements</h2>
      <!-- Content -->
    </section>

    <section aria-labelledby="nice-to-have-heading">
      <h2 id="nice-to-have-heading">Nice to Have</h2>
      <!-- Content -->
    </section>

    <section id="apply-form" aria-labelledby="apply-heading">
      <h2 id="apply-heading">Apply for this Role</h2>
      <!-- Application form -->
    </section>
  </article>
</main>
```

### Breadcrumb Navigation
```html
<nav aria-label="Breadcrumb">
  <ol class="flex items-center gap-2" role="list">
    <li>
      <a href="/" aria-label="Home">Home</a>
    </li>
    <li aria-hidden="true">/</li>
    <li>
      <a href="/careers">Careers</a>
    </li>
    <li aria-hidden="true">/</li>
    <li aria-current="page">
      <span>Senior Full-Stack Engineer</span>
    </li>
  </ol>
</nav>
```

### Skip Links
```html
<a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-primary text-white px-4 py-2 rounded-md z-50">
  Skip to main content
</a>
<a href="#apply-form" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-48 bg-primary text-white px-4 py-2 rounded-md z-50">
  Skip to application form
</a>
```

### Form Accessibility
```html
<form aria-label="Job application form">
  <div>
    <label for="email">
      Email <span class="text-red-500" aria-label="required">*</span>
    </label>
    <input
      id="email"
      type="email"
      required
      aria-required="true"
      aria-describedby="email-hint"
    />
    <p id="email-hint" class="text-xs text-slate-500">
      We'll use this to contact you about your application
    </p>
  </div>
</form>
```

### Focus Management
- Apply button should be clearly visible in focus states
- Form fields have visible focus rings (`focus:ring-2 focus:ring-[#137fec]`)
- Sticky mobile button doesn't trap focus
- Submit confirmation should announce to screen readers

### Color Contrast
- Primary blue (#137fec) on white: 4.52:1 ✓
- Check circle icons use primary blue for visibility
- Muted icons use slate-400 (not critical for comprehension)
- All text meets 4.5:1 minimum contrast

---

## Do's and Don'ts

### Colors
- ✅ Use `#137fec` for primary actions, department badges, check icons
- ✅ Use `#0e6ac7` for hover states on buttons
- ✅ Use slate-400 for non-critical icons (nice-to-have items)
- ❌ Don't use primary blue for nice-to-have checkmarks (use muted slate)
- ❌ Don't use red except for required field indicators

### Typography
- ✅ Use Inter font family consistently
- ✅ Use semibold (600) for section headings
- ✅ Use proper heading hierarchy (h1 > h2 > h3)
- ❌ Don't skip heading levels
- ❌ Don't use more than 3 font weights on one page

### Spacing
- ✅ Use base-4 spacing system (4, 8, 12, 16, 24, 32, 48, 64)
- ✅ Use consistent padding within card sections (p-6 lg:p-8)
- ✅ Use space-y-3 for list items
- ❌ Don't use arbitrary spacing values
- ❌ Don't crowd form fields

### Dark Mode
- ✅ Test all components in both light and dark mode
- ✅ Use `dark:` prefix for all color utilities
- ✅ Adjust backgrounds (white → slate-800, slate-50 → slate-900)
- ❌ Don't use pure black (#000000)
- ❌ Don't forget border color adjustments

### Forms
- ✅ Label all inputs clearly
- ✅ Mark required fields with red asterisk
- ✅ Provide helpful placeholders
- ✅ Show loading state on submit
- ❌ Don't use placeholder as label
- ❌ Don't submit without validation feedback

### Responsive Design
- ✅ Mobile-first approach
- ✅ Stack metadata vertically on mobile (flex-wrap)
- ✅ Show fixed apply button on mobile only (lg:hidden)
- ✅ Use grid for benefits (1 → 2 columns)
- ❌ Don't hide critical information on mobile
- ❌ Don't let lines exceed readable width

---

## Reference: Existing Careers Index Page

The careers index page at `apps/web/src/app/(public)/careers/page.tsx` establishes these patterns:

1. **Hero Section**: Dark gradient background with "We're hiring" badge
2. **Values Section**: Three columns with title + description
3. **Job Cards**: Card with hover border, department badge, metadata icons
4. **Expandable Requirements**: `<details>` element with checkmark list
5. **Benefits Grid**: 6 benefits with icon boxes
6. **Application Form**: Full form with file upload, position select

The career detail page should maintain visual consistency with these patterns while providing more depth on the individual job.

---

## Page Structure for Career Detail

```
/careers/[id]/page.tsx
├── Header (from layout)
├── Breadcrumb Navigation
├── Job Detail Template
│   ├── Header Section
│   │   ├── Department Badge
│   │   ├── Job Title (H1)
│   │   └── Metadata (location, type, date, salary)
│   ├── About the Role Section
│   ├── Requirements Section (checkmark list)
│   ├── Nice to Have Section (plus icon list)
│   └── What We Offer Section (benefits grid)
├── Application Form Section
│   ├── Form Header
│   └── ApplicationForm Component (reuse from careers page)
├── Related Positions Section (optional)
├── Fixed Mobile Apply Button
└── Footer (from layout)
```

---

## Static Generation with Dynamic Params

```typescript
// apps/web/app/(public)/careers/[id]/page.tsx

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

// Generate static params for all job IDs
export async function generateStaticParams() {
  // In production, fetch from API/CMS
  const jobs = await getJobs();
  return jobs.map((job) => ({
    id: job.id,
  }));
}

// Generate metadata for SEO
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await getJob(params.id);

  if (!job) {
    return {
      title: 'Job Not Found | IntelliFlow CRM',
    };
  }

  return {
    title: `${job.title} | Careers | IntelliFlow CRM`,
    description: job.description,
    openGraph: {
      title: `${job.title} at IntelliFlow`,
      description: job.description,
      type: 'website',
    },
  };
}

export default async function CareerDetailPage({ params }: { params: { id: string } }) {
  const job = await getJob(params.id);

  if (!job) {
    notFound();
  }

  return (
    // Page content
  );
}
```

---

## Performance Requirements

- **Response Time**: <200ms (server response)
- **Lighthouse Score**: ≥90 for Performance, Accessibility, Best Practices, SEO
- **Core Web Vitals**:
  - LCP (Largest Contentful Paint): <2.5s
  - FID (First Input Delay): <100ms
  - CLS (Cumulative Layout Shift): <0.1

### Optimization Strategies
1. Use Next.js `generateStaticParams` for static generation of all job pages
2. Reuse ApplicationForm component from careers index
3. Lazy load non-critical sections
4. Use skeleton loading states for dynamic content
5. Minimize client-side JavaScript (keep apply button minimal)

---

## Delivery Checklist
- Follow TDD: write/extend tests before implementation.
- Respect Definition of Done and produce required artifacts.
- Run lint/typecheck/test/build/security scans.
- Attach evidence (context_pack, context_ack, summaries).

### Implementation Checklist
- [ ] Create `apps/web/app/(public)/careers/[id]/page.tsx`
- [ ] Create `apps/web/components/shared/job-detail-template.tsx`
- [ ] Create `apps/web/components/shared/apply-button.tsx`
- [ ] Implement `generateStaticParams` for all job IDs
- [ ] Implement `generateMetadata` for SEO
- [ ] Add unit tests for JobDetailTemplate
- [ ] Add unit tests for ApplyButton
- [ ] Integrate with existing ApplicationForm
- [ ] Add 404 handling with `notFound()`
- [ ] Verify Lighthouse ≥90
- [ ] Verify response <200ms
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Verify dark mode styling
- [ ] Test fixed mobile apply button
- [ ] Create attestation evidence
