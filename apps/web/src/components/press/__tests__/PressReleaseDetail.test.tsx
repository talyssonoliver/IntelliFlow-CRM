import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  PressReleaseDetail,
  type PressRelease,
  type PressReleaseDetailProps,
} from '../PressReleaseDetail';

// Mock MarkdownRenderer to render content as plain text
vi.mock('@/components/blog/markdown-renderer', () => ({
  MarkdownRenderer: ({ content, className }: Readonly<{ content: string; className?: string }>) => (
    <div data-testid="markdown-renderer" className={className}>
      {content}
    </div>
  ),
}));

// Mock ShareButtons to verify props
vi.mock('@/components/blog/share-buttons', () => ({
  ShareButtons: ({ title, slug, url }: Readonly<{ title: string; slug: string; url?: string }>) => (
    <div data-testid="share-buttons" data-title={title} data-slug={slug} data-url={url}>
      Share Buttons Mock
    </div>
  ),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: Readonly<{
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const boilerplate =
  'IntelliFlow CRM is an AI-powered customer relationship management platform helping modern sales teams automate workflows with enterprise-grade governance. Founded in 2024 and headquartered in London, IntelliFlow serves over 100 customers worldwide.';

function createRelease(overrides: Partial<PressRelease> = {}): PressRelease {
  return {
    id: 'pr-004',
    date: '2025-01-15',
    title: 'IntelliFlow CRM Launches AI-Powered Lead Scoring Engine',
    summary:
      'New machine learning capabilities enable sales teams to prioritize leads with 95% accuracy.',
    category: 'Product',
    featured: true,
    body: '## AI-Powered Lead Scoring\n\nIntelliFlow CRM today announced the launch of its AI-powered lead scoring engine, designed to help sales teams prioritize high-value prospects with unprecedented accuracy.',
    quotes: [
      {
        text: 'Our AI lead scoring engine represents a breakthrough in sales intelligence.',
        attribution: 'Jane Smith, CEO, IntelliFlow',
      },
    ],
    boilerplate,
    readTime: '3 min read',
    ...overrides,
  };
}

function createNonFeaturedRelease(overrides: Partial<PressRelease> = {}): PressRelease {
  return {
    id: 'pr-003',
    date: '2024-12-20',
    title: 'IntelliFlow CRM Achieves ISO 27001 Certification',
    summary:
      'Enterprise-grade security validation demonstrates commitment to protecting customer data.',
    category: 'Security',
    featured: false,
    body: '## ISO 27001 Certification\n\nIntelliFlow CRM has achieved ISO 27001 certification for its information security management system.',
    quotes: [
      {
        text: 'Achieving ISO 27001 certification validates our commitment to data security.',
        attribution: 'John Doe, CTO, IntelliFlow',
      },
    ],
    boilerplate,
    readTime: '2 min read',
    ...overrides,
  };
}

const defaultPressContact = {
  name: 'Media Relations',
  email: 'press@intelliflow-crm.com',
  phone: '+1 (555) 123-4567',
};

function createRelatedReleases(): PressRelease[] {
  return [
    createNonFeaturedRelease(),
    createRelease({
      id: 'pr-002',
      date: '2024-11-15',
      title: 'IntelliFlow CRM Announces Partnership with Major ERP Providers',
      summary:
        'New integrations with SAP and Oracle enable seamless data flow between CRM and ERP systems.',
      category: 'Partnership',
      featured: false,
    }),
  ];
}

function renderComponent(overrides: Partial<PressReleaseDetailProps> = {}) {
  const defaultProps: PressReleaseDetailProps = {
    release: createRelease(),
    relatedReleases: createRelatedReleases(),
    pressContact: defaultPressContact,
    ...overrides,
  };
  return render(<PressReleaseDetail {...defaultProps} />);
}

// ─── Test Group 1: Page Structure (AC-001, A11Y-001, A11Y-003) ───────────────

describe('Page Structure', () => {
  it('renders <article aria-labelledby="pr-title"> landmark', () => {
    renderComponent();
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('aria-labelledby', 'pr-title');
  });

  it('renders <h1 id="pr-title"> with release title', () => {
    renderComponent();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAttribute('id', 'pr-title');
    expect(heading).toHaveTextContent('IntelliFlow CRM Launches AI-Powered Lead Scoring Engine');
  });

  it('does NOT render <main> (layout provides it)', () => {
    const { container } = renderComponent();
    expect(container.querySelector('main')).toBeNull();
  });

  it('renders back link to /press with text "Back to Press Releases"', () => {
    renderComponent();
    const backLink = screen.getByText(/Back to Press Releases/);
    expect(backLink.closest('a')).toHaveAttribute('href', '/press');
  });
});

// ─── Test Group 2: Breadcrumb Navigation (AC-011, A11Y-002) ─────────────────

describe('Breadcrumb Navigation', () => {
  it('renders <nav aria-label="Breadcrumb">', () => {
    renderComponent();
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav.tagName).toBe('NAV');
  });

  it('renders <ol> with Home, Press, and current title crumbs', () => {
    renderComponent();
    const nav = screen.getByLabelText('Breadcrumb');
    const list = within(nav).getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(3);
  });

  it('Home links to /, Press links to /press', () => {
    renderComponent();
    const nav = screen.getByLabelText('Breadcrumb');
    const links = within(nav).getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/');
    expect(links[1]).toHaveAttribute('href', '/press');
  });

  it('terminal crumb has aria-current="page"', () => {
    renderComponent();
    const nav = screen.getByLabelText('Breadcrumb');
    const items = within(nav).getAllByRole('listitem');
    const lastItem = items[items.length - 1];
    expect(lastItem).toHaveAttribute('aria-current', 'page');
  });

  it('separators have aria-hidden="true"', () => {
    renderComponent();
    const nav = screen.getByLabelText('Breadcrumb');
    const separators = nav.querySelectorAll('[aria-hidden="true"]');
    expect(separators.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Test Group 3: Release Content (AC-001, A11Y-004, A11Y-005) ─────────────

describe('Release Content', () => {
  it('renders category badge with correct text', () => {
    renderComponent();
    expect(screen.getByText('Product')).toBeInTheDocument();
  });

  it('renders date in <time dateTime="YYYY-MM-DD"> format', () => {
    renderComponent();
    const timeElement = screen.getByText('January 15, 2025');
    expect(timeElement.closest('time')).toHaveAttribute('dateTime', '2025-01-15');
  });

  it('renders <h1> with release title (single h1 on page)', () => {
    const { container } = renderComponent();
    const h1Elements = container.querySelectorAll('h1');
    expect(h1Elements.length).toBe(1);
    expect(h1Elements[0]).toHaveTextContent(
      'IntelliFlow CRM Launches AI-Powered Lead Scoring Engine'
    );
  });

  it('renders summary text', () => {
    renderComponent();
    expect(screen.getByText(/prioritize leads with 95% accuracy/)).toBeInTheDocument();
  });

  it('renders body content via MarkdownRenderer', () => {
    renderComponent();
    const renderer = screen.getByTestId('markdown-renderer');
    expect(renderer).toHaveTextContent(/AI-Powered Lead Scoring/);
  });
});

// ─── Test Group 4: Executive Quotes (AC-007) ────────────────────────────────

describe('Executive Quotes', () => {
  it('renders blockquote elements for each quote', () => {
    renderComponent();
    const blockquotes = screen.getAllByRole('blockquote');
    expect(blockquotes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders attribution text for each quote', () => {
    renderComponent();
    expect(screen.getByText(/Jane Smith, CEO, IntelliFlow/)).toBeInTheDocument();
  });
});

// ─── Test Group 5: Boilerplate Section (AC-008) ─────────────────────────────

describe('Boilerplate Section', () => {
  it('renders "About IntelliFlow" boilerplate text', () => {
    renderComponent();
    expect(
      screen.getByText(/IntelliFlow CRM is an AI-powered customer relationship/)
    ).toBeInTheDocument();
  });
});

// ─── Test Group 6: Press Contact (AC-006) ───────────────────────────────────

describe('Press Contact', () => {
  it('renders contact name', () => {
    renderComponent();
    expect(screen.getByText('Media Relations')).toBeInTheDocument();
  });

  it('renders email with mailto: href', () => {
    renderComponent();
    const emailLink = screen.getByText('press@intelliflow-crm.com');
    expect(emailLink.closest('a')).toHaveAttribute('href', 'mailto:press@intelliflow-crm.com');
  });

  it('renders phone with tel: href', () => {
    renderComponent();
    const phoneLink = screen.getByText('+1 (555) 123-4567');
    expect(phoneLink.closest('a')).toHaveAttribute('href', 'tel:+15551234567');
  });
});

// ─── Test Group 7: Share Buttons (AC-009) ───────────────────────────────────

describe('Share Buttons', () => {
  it('renders ShareButtons component with url prop set to /press/${id}', () => {
    renderComponent();
    const shareButtons = screen.getByTestId('share-buttons');
    expect(shareButtons).toHaveAttribute('data-url', '/press/pr-004');
  });

  it('ShareButtons receives title prop matching release title', () => {
    renderComponent();
    const shareButtons = screen.getByTestId('share-buttons');
    expect(shareButtons).toHaveAttribute(
      'data-title',
      'IntelliFlow CRM Launches AI-Powered Lead Scoring Engine'
    );
  });
});

// ─── Test Group 8: Related Releases (AC-010, A11Y-006, A11Y-008) ───────────

describe('Related Releases', () => {
  it('renders related releases section when relatedReleases.length > 0', () => {
    renderComponent();
    expect(screen.getByText('More Press Releases')).toBeInTheDocument();
  });

  it('does NOT render related section when relatedReleases is empty', () => {
    renderComponent({ relatedReleases: [] });
    expect(screen.queryByText('More Press Releases')).not.toBeInTheDocument();
  });

  it('section has aria-labelledby="related-releases-heading"', () => {
    renderComponent();
    const section = screen.getByText('More Press Releases').closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'related-releases-heading');
  });

  it('each related link has aria-label with release title', () => {
    renderComponent();
    const relatedLink = screen.getByLabelText(
      /Read full press release: IntelliFlow CRM Achieves ISO 27001 Certification/
    );
    expect(relatedLink).toBeInTheDocument();
  });
});

// ─── Test Group 9: Accessibility (A11Y-001 through A11Y-008) ────────────────

describe('Accessibility', () => {
  it('single <h1> on the page', () => {
    const { container } = renderComponent();
    expect(container.querySelectorAll('h1').length).toBe(1);
  });

  it('all decorative icons have aria-hidden="true"', () => {
    const { container } = renderComponent();
    const icons = container.querySelectorAll('.material-symbols-outlined');
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('heading hierarchy: h1 → h2 (no skipping)', () => {
    const { container } = renderComponent();
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const levels = Array.from(headings).map((h) => parseInt(h.tagName[1]));
    // First heading is h1, subsequent should be h2 or h3 (no gap > 1)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Test Group 10: Dark Mode ───────────────────────────────────────────────

describe('Dark Mode', () => {
  it('key elements have dark: class variants', () => {
    const { container } = renderComponent();
    const darkElements = container.querySelectorAll('[class*="dark:"]');
    expect(darkElements.length).toBeGreaterThan(0);
  });
});

// ─── Test Group 11: Brand Consistency ───────────────────────────────────────

describe('Brand Consistency', () => {
  it('uses IntelliFlow brand colors (#137fec or #0e6ac7)', () => {
    const { container } = renderComponent();
    const html = container.innerHTML;
    expect(html).toMatch(/#137fec|#0e6ac7|137fec|0e6ac7/);
  });

  it('uses Material Symbols icons (material-symbols-outlined)', () => {
    const { container } = renderComponent();
    const icons = container.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
  });
});

// ─── Test Group 12: Not Found Behavior (AC-004) ────────────────────────────

describe('Not Found Behavior', () => {
  it('does NOT render component content when release is null/undefined', () => {
    // PressReleaseDetail should handle missing release gracefully
    // Page-level notFound() is verified by build (SSG generates only valid IDs)
    const { container } = render(
      <PressReleaseDetail
        release={null as any /* test-only: verifying null-safety */}
        relatedReleases={[]}
        pressContact={defaultPressContact}
      />
    );
    // Should not render the article landmark
    expect(container.querySelector('article')).toBeNull();
  });
});

// ─── Test Group 13: Data-Driven Tests (Spec Test Group 3) ──────────────────

describe('Data-Driven Tests', () => {
  const allReleases: Array<{ id: string; title: string; category: string }> = [
    {
      id: 'pr-001',
      title: 'IntelliFlow CRM Emerges from Stealth with $5M Seed Funding',
      category: 'Company',
    },
    {
      id: 'pr-002',
      title: 'IntelliFlow CRM Announces Partnership with Major ERP Providers',
      category: 'Partnership',
    },
    {
      id: 'pr-003',
      title: 'IntelliFlow CRM Achieves ISO 27001 Certification',
      category: 'Security',
    },
    {
      id: 'pr-004',
      title: 'IntelliFlow CRM Launches AI-Powered Lead Scoring Engine',
      category: 'Product',
    },
  ];

  it.each(allReleases)('renders release $id correctly', ({ id, title, category }) => {
    const release = createRelease({ id, title, category, featured: id === 'pr-004' });
    renderComponent({ release, relatedReleases: [] });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title);
  });

  it.each(allReleases)(
    'verifies category badge text for $id matches "$category"',
    ({ id, title, category }) => {
      const release = createRelease({ id, title, category });
      renderComponent({ release, relatedReleases: [] });
      expect(screen.getByText(category)).toBeInTheDocument();
    }
  );
});

// ─── Test Group 14: Featured vs Non-Featured Rendering ─────────────────────

describe('Featured vs Non-Featured Rendering', () => {
  it('featured release (featured: true) renders with expected styling', () => {
    renderComponent({ release: createRelease({ featured: true }) });
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('non-featured release (featured: false) renders with expected styling', () => {
    renderComponent({ release: createNonFeaturedRelease() });
    const article = screen.getByRole('article');
    expect(article).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('both featured and non-featured show identical structural elements', () => {
    const { container: featuredContainer } = render(
      <PressReleaseDetail
        release={createRelease({ featured: true })}
        relatedReleases={[]}
        pressContact={defaultPressContact}
      />
    );
    const { container: nonFeaturedContainer } = render(
      <PressReleaseDetail
        release={createNonFeaturedRelease()}
        relatedReleases={[]}
        pressContact={defaultPressContact}
      />
    );

    // Both should have article, h1, breadcrumb nav
    expect(featuredContainer.querySelector('article')).toBeTruthy();
    expect(nonFeaturedContainer.querySelector('article')).toBeTruthy();
    expect(featuredContainer.querySelector('h1')).toBeTruthy();
    expect(nonFeaturedContainer.querySelector('h1')).toBeTruthy();
    expect(featuredContainer.querySelector('nav[aria-label="Breadcrumb"]')).toBeTruthy();
    expect(nonFeaturedContainer.querySelector('nav[aria-label="Breadcrumb"]')).toBeTruthy();
  });
});
