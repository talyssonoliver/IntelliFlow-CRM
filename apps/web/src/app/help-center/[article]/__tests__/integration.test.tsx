import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Integration test: real ArticleRenderer + FeedbackWidget, DB-shaped data via mocked tRPC.
// Proves the end-to-end editor -> DB -> public render contract (PG-181 tiptapDoc -> IFC-302).

interface QueryState {
  data: unknown;
  isLoading: boolean;
  error: { data?: { code?: string } } | null;
  refetch: ReturnType<typeof vi.fn>;
}
const mockArticleQuery: QueryState = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
const mockCategoryQuery: QueryState = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
const mockRelatedQuery: QueryState = {
  data: undefined,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
const mockSubmitFeedback = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    helpArticle: {
      getBySlug: { useQuery: () => mockArticleQuery },
      getByCategory: { useQuery: () => mockCategoryQuery },
      getRelated: { useQuery: () => mockRelatedQuery },
      submitFeedback: {
        useMutation: (opts: { onSuccess?: () => void }) => ({
          mutate: (data: unknown) => {
            mockSubmitFeedback(data);
            opts.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ article: 'quick-start-guide' })),
  notFound: (...args: unknown[]) => {
    mockNotFound(...args);
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({
    title,
    description,
    breadcrumbs,
  }: Readonly<{
    title: string;
    description?: string;
    breadcrumbs?: Array<{ label: string; href?: string }>;
  }>) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {breadcrumbs && (
        <nav aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i}>{b.href ? <a href={b.href}>{b.label}</a> : <span>{b.label}</span>}</span>
          ))}
        </nav>
      )}
    </div>
  ),
}));

import { useParams } from 'next/navigation';

const DB_ARTICLE = {
  id: 'gs-001',
  slug: 'quick-start-guide',
  title: 'Quick Start Guide',
  categoryId: 'getting-started',
  excerpt: 'Get up and running.',
  readTimeMinutes: 4,
  updatedAt: '2026-03-01T00:00:00.000Z',
  sections: [
    {
      id: 's1',
      heading: 'Overview',
      content: 'fallback content',
      // Editor-authored tiptapDoc wrapper (PG-181 storage shape).
      blocks: [
        {
          type: 'tiptapDoc',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Editor authored intro.' }] },
          ],
        },
      ],
    },
    {
      id: 's2',
      heading: 'Steps',
      content: 'fallback content 2',
      // Legacy ContentBlock (seed shape) must still render via BlockRenderer.
      blocks: [{ type: 'steps', items: ['Do step A', 'Do step B'] }],
    },
  ],
};

let ArticlePage: () => React.JSX.Element;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(useParams).mockReturnValue({ article: 'quick-start-guide' });
  for (const q of [mockArticleQuery, mockCategoryQuery, mockRelatedQuery]) {
    q.data = undefined;
    q.isLoading = false;
    q.error = null;
  }
  mockArticleQuery.data = DB_ARTICLE;
  mockRelatedQuery.data = [];
  const mod = await import('../page');
  ArticlePage = mod.default;
});

describe('ArticlePage integration (real ArticleRenderer)', () => {
  it('renders the full article with h1, article landmark and section headings', () => {
    render(<ArticlePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Quick Start Guide');
    expect(screen.getByRole('article')).toBeInTheDocument();
    const h2s = screen.getAllByRole('heading', { level: 2 }).filter((h) => h.id);
    expect(h2s.length).toBe(2);
  });

  it('renders editor-authored tiptapDoc body content (closes the DB->render contract)', () => {
    render(<ArticlePage />);
    expect(screen.getByText('Editor authored intro.')).toBeInTheDocument();
    // The plain-text fallback must NOT appear when a tiptapDoc body is present.
    expect(screen.queryByText('fallback content')).not.toBeInTheDocument();
  });

  it('still renders legacy ContentBlock sections (seed data)', () => {
    render(<ArticlePage />);
    expect(screen.getByText('Do step A')).toBeInTheDocument();
    expect(screen.getByText('Do step B')).toBeInTheDocument();
  });

  it('renders article metadata: read time and an updated <time> element', () => {
    render(<ArticlePage />);
    expect(screen.getAllByText(/min read/).length).toBeGreaterThan(0);
    expect(screen.getByRole('article').querySelector('time')).toBeInTheDocument();
  });

  it('FeedbackWidget submits and shows a thank-you state', async () => {
    const user = userEvent.setup();
    render(<ArticlePage />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(mockSubmitFeedback).toHaveBeenCalled();
    expect(screen.getByText(/thank you/i)).toBeInTheDocument();
  });

  it('renders breadcrumb hierarchy Dashboard > Help Center', () => {
    render(<ArticlePage />);
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav.textContent).toContain('Dashboard');
    expect(nav.textContent).toContain('Help Center');
  });
});

describe('ArticlePage integration — category listing mode', () => {
  beforeEach(() => {
    vi.mocked(useParams).mockReturnValue({ article: 'getting-started' });
    mockCategoryQuery.data = [
      {
        id: 'gs-001',
        slug: 'quick-start-guide',
        title: 'Quick Start Guide',
        excerpt: 'x',
        readTimeMinutes: 4,
        sectionCount: 3,
      },
      {
        id: 'gs-002',
        slug: 'navigating-the-dashboard',
        title: 'Navigating',
        excerpt: 'y',
        readTimeMinutes: 3,
        sectionCount: 2,
      },
    ];
  });

  it('lists the category articles with links and the section-count chip', () => {
    const { container } = render(<ArticlePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Getting Started');
    const links = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/help-center/'));
    expect(links.length).toBe(2);
    expect(container).toHaveTextContent('3 sections');
    expect(container).toHaveTextContent('2 sections');
  });
});
