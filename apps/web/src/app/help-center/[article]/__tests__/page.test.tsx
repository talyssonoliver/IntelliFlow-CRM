import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ─── Hoisted query state (vitest mockReset only clears vi.fn(), not these objects) ──
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

vi.mock('@/lib/trpc', () => ({
  trpc: {
    helpArticle: {
      getBySlug: { useQuery: () => mockArticleQuery },
      getByCategory: { useQuery: () => mockCategoryQuery },
      getRelated: { useQuery: () => mockRelatedQuery },
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

vi.mock('@/components/support/article-renderer', () => ({
  ArticleRenderer: ({ article }: Readonly<{ article: { id: string } }>) => (
    <div data-testid="article-renderer" data-article-id={article.id} />
  ),
}));

vi.mock('@/components/support/feedback-widget', () => ({
  FeedbackWidget: ({ articleId }: Readonly<{ articleId: string }>) => (
    <div data-testid="feedback-widget" data-article-id={articleId} />
  ),
}));

vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({
    title,
    breadcrumbs,
  }: Readonly<{ title: string; breadcrumbs?: Array<{ label: string; href?: string }> }>) => (
    <div data-testid="page-header" data-title={title}>
      <h1>{title}</h1>
      {breadcrumbs?.map((b, i) => (
        <span key={i} data-testid={`breadcrumb-${i}`} data-href={b.href}>
          {b.label}
        </span>
      ))}
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
  sections: [{ heading: 'Intro', content: 'Body text', blocks: null }],
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
  const mod = await import('../page');
  ArticlePage = mod.default;
});

describe('ArticlePage — article detail mode', () => {
  it('shows a loading status while the article query is pending (no notFound)', () => {
    mockArticleQuery.isLoading = true;
    render(<ArticlePage />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading article');
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('calls notFound() when getBySlug errors with NOT_FOUND', () => {
    mockArticleQuery.error = { data: { code: 'NOT_FOUND' } };
    expect(() => render(<ArticlePage />)).toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('renders a recoverable error (not notFound) on UNAUTHORIZED', () => {
    mockArticleQuery.error = { data: { code: 'UNAUTHORIZED' } };
    render(<ArticlePage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('clicking "Try again" on the error state refetches the article', async () => {
    const user = userEvent.setup();
    mockArticleQuery.error = { data: { code: 'UNAUTHORIZED' } };
    render(<ArticlePage />);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockArticleQuery.refetch).toHaveBeenCalled();
  });

  it('omits the category breadcrumb when the article category is unknown', () => {
    mockArticleQuery.data = { ...DB_ARTICLE, categoryId: 'no-such-category' };
    render(<ArticlePage />);
    // Without a matching category, the breadcrumb goes straight to the article title.
    expect(screen.getByTestId('breadcrumb-2')).toHaveTextContent('Quick Start Guide');
    expect(screen.queryByTestId('breadcrumb-3')).not.toBeInTheDocument();
  });

  it('renders header, renderer and feedback widget from DB data', () => {
    mockArticleQuery.data = DB_ARTICLE;
    render(<ArticlePage />);
    expect(screen.getByTestId('page-header')).toHaveAttribute('data-title', 'Quick Start Guide');
    expect(screen.getByTestId('article-renderer')).toHaveAttribute('data-article-id', 'gs-001');
    expect(screen.getByTestId('feedback-widget')).toHaveAttribute('data-article-id', 'gs-001');
  });

  it('renders breadcrumbs Dashboard > Help Center > Category > Article', () => {
    mockArticleQuery.data = DB_ARTICLE;
    render(<ArticlePage />);
    expect(screen.getByTestId('breadcrumb-0')).toHaveTextContent('Dashboard');
    expect(screen.getByTestId('breadcrumb-1')).toHaveTextContent('Help Center');
    expect(screen.getByTestId('breadcrumb-2')).toHaveTextContent('Getting Started');
    expect(screen.getByTestId('breadcrumb-3')).toHaveTextContent('Quick Start Guide');
  });

  it('renders the related-articles section when getRelated returns items', () => {
    mockArticleQuery.data = DB_ARTICLE;
    mockRelatedQuery.data = [
      {
        id: 'gs-002',
        slug: 'navigating-the-dashboard',
        title: 'Navigating',
        excerpt: 'x',
        readTimeMinutes: 3,
        categoryId: 'getting-started',
      },
    ];
    render(<ArticlePage />);
    expect(screen.getByRole('heading', { name: 'Related Articles' })).toBeInTheDocument();
    expect(screen.getByText('Navigating')).toBeInTheDocument();
  });

  it('omits the related-articles section when getRelated is empty', () => {
    mockArticleQuery.data = DB_ARTICLE;
    mockRelatedQuery.data = [];
    render(<ArticlePage />);
    expect(screen.queryByRole('heading', { name: 'Related Articles' })).not.toBeInTheDocument();
  });
});

describe('ArticlePage — category listing mode', () => {
  beforeEach(() => {
    vi.mocked(useParams).mockReturnValue({ article: 'getting-started' });
  });

  it('shows a loading status while the category query is pending', () => {
    mockCategoryQuery.isLoading = true;
    render(<ArticlePage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the category title and article cards with the sectionCount chip', () => {
    mockCategoryQuery.data = [
      {
        id: 'gs-001',
        slug: 'quick-start-guide',
        title: 'Quick Start Guide',
        excerpt: 'x',
        readTimeMinutes: 4,
        sectionCount: 3,
      },
    ];
    const { container } = render(<ArticlePage />);
    expect(screen.getByTestId('page-header')).toHaveAttribute('data-title', 'Getting Started');
    expect(screen.getByText('Quick Start Guide')).toBeInTheDocument();
    expect(container).toHaveTextContent('3 sections');
  });

  it('uses singular "section" when an article has exactly one section', () => {
    mockCategoryQuery.data = [
      {
        id: 'gs-001',
        slug: 'quick-start-guide',
        title: 'Quick Start Guide',
        excerpt: 'x',
        readTimeMinutes: 4,
        sectionCount: 1,
      },
    ];
    const { container } = render(<ArticlePage />);
    expect(container).toHaveTextContent('1 section');
    expect(container).not.toHaveTextContent('1 sections');
  });

  it('renders EmptyState when the category has no articles', () => {
    mockCategoryQuery.data = [];
    render(<ArticlePage />);
    expect(screen.getByRole('region', { name: /documents empty state/i })).toBeInTheDocument();
  });

  it('renders a recoverable error when the category query fails', () => {
    mockCategoryQuery.error = { data: { code: 'INTERNAL_SERVER_ERROR' } };
    render(<ArticlePage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('ArticlePage — source contract', () => {
  it('is a client component and has no static DEFAULT_HELP_ARTICLES data dependency', () => {
    const source = readFileSync(resolve(__dirname, '../page.tsx'), 'utf-8');
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
    expect(source).not.toContain('DEFAULT_HELP_ARTICLES');
    expect(source).not.toContain('getArticleBySlug');
    expect(source).not.toContain('getArticlesByCategory');
    expect(source).not.toContain('getRelatedArticles');
    expect(source).toContain('trpc.helpArticle.getBySlug');
  });
});
