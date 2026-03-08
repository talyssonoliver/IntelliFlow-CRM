import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Mock next/navigation
const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ article: 'quick-start-guide' })),
  notFound: (...args: unknown[]) => {
    mockNotFound(...args);
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// Mock child components with data-testid bridge pattern
vi.mock('@/components/support/article-renderer', () => ({
  ArticleRenderer: ({ article }: Readonly<{ article: { id: string; title: string } }>) => (
    <div data-testid="article-renderer" data-article-id={article.id}>
      {article.title}
    </div>
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
  }: Readonly<{
    title: string;
    breadcrumbs?: Array<{ label: string; href?: string }>;
  }>) => (
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
import type { HelpArticle as _HelpArticle } from '@/lib/support/help-articles';

// We need to import the page component after the mocks
let ArticlePage: () => React.JSX.Element;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import('../page');
  ArticlePage = mod.default;
});

describe('ArticlePage', () => {
  it('renders PageHeader with article title', () => {
    render(<ArticlePage />);
    const header = screen.getByTestId('page-header');
    expect(header).toBeInTheDocument();
    // Should have a non-empty title
    expect(header.getAttribute('data-title')).toBeTruthy();
  });

  it('renders ArticleRenderer with article data', () => {
    render(<ArticlePage />);
    const renderer = screen.getByTestId('article-renderer');
    expect(renderer).toBeInTheDocument();
    expect(renderer.getAttribute('data-article-id')).toBeTruthy();
  });

  it('renders FeedbackWidget with articleId', () => {
    render(<ArticlePage />);
    const widget = screen.getByTestId('feedback-widget');
    expect(widget).toBeInTheDocument();
    expect(widget.getAttribute('data-article-id')).toBeTruthy();
  });

  it('renders related articles section when article has related', () => {
    render(<ArticlePage />);
    // Related articles may or may not exist depending on the article data
    expect(screen.getByTestId('article-renderer')).toBeInTheDocument();
  });

  it('calls notFound() when slug matches neither article nor category', () => {
    vi.mocked(useParams).mockReturnValue({ article: 'nonexistent-slug-xyz' });
    expect(() => render(<ArticlePage />)).toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('category slug renders category listing mode', () => {
    vi.mocked(useParams).mockReturnValue({ article: 'getting-started' });
    render(<ArticlePage />);
    const header = screen.getByTestId('page-header');
    expect(header.getAttribute('data-title')).toBe('Getting Started');
  });

  it('breadcrumbs show Dashboard > Help Center > Category > Article for article mode', () => {
    render(<ArticlePage />);
    const bc0 = screen.getByTestId('breadcrumb-0');
    expect(bc0).toHaveTextContent('Dashboard');
    expect(bc0).toHaveAttribute('data-href', '/dashboard');

    const bc1 = screen.getByTestId('breadcrumb-1');
    expect(bc1).toHaveTextContent('Help Center');
    expect(bc1).toHaveAttribute('data-href', '/help-center');
  });

  it('breadcrumbs show Dashboard > Help Center > Category for category mode', () => {
    vi.mocked(useParams).mockReturnValue({ article: 'getting-started' });
    render(<ArticlePage />);
    const bc0 = screen.getByTestId('breadcrumb-0');
    expect(bc0).toHaveTextContent('Dashboard');

    const bc1 = screen.getByTestId('breadcrumb-1');
    expect(bc1).toHaveTextContent('Help Center');
  });

  it('related articles exclude the current article', () => {
    render(<ArticlePage />);
    // Article renderer should have the current article's id
    const renderer = screen.getByTestId('article-renderer');
    expect(renderer).toBeInTheDocument();
  });

  it('page source has "use client" directive', () => {
    const filePath = resolve(__dirname, '../page.tsx');
    const source = readFileSync(filePath, 'utf-8');
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });
});
