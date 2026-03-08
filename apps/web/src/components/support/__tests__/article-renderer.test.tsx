import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ArticleRenderer } from '../article-renderer';
import type { HelpArticle } from '@/lib/support/help-articles';

const SAMPLE_ARTICLE: HelpArticle = {
  id: 'test-article-1',
  slug: 'test-article',
  title: 'Test Article Title',
  categoryId: 'getting-started',
  excerpt: 'A test article for rendering',
  sections: [
    { heading: 'First Section', content: 'Content for the first section.' },
    { heading: 'Second Section', content: 'Content for the second section.' },
    { heading: 'Third Section', content: 'Content for the third section.' },
  ],
  readTimeMinutes: 5,
  lastUpdatedAt: '2026-03-01',
  keywords: ['test'],
  relatedArticleIds: [],
  order: 0,
};

const SINGLE_SECTION_ARTICLE: HelpArticle = {
  ...SAMPLE_ARTICLE,
  id: 'single-section',
  sections: [{ heading: 'Only Section', content: 'Only section content.' }],
};

const EMPTY_SECTIONS_ARTICLE: HelpArticle = {
  ...SAMPLE_ARTICLE,
  id: 'empty-sections',
  sections: [],
};

const LONG_TITLE_ARTICLE: HelpArticle = {
  ...SAMPLE_ARTICLE,
  id: 'long-title',
  title: 'This Is A Very Long Article Title That Should Wrap Properly Without Causing Overflow Issues In The Layout',
};

describe('ArticleRenderer', () => {
  it('wraps content in <article> landmark element', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('renders each section heading as <h2> with id attribute', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(3);
    expect(headings[0]).toHaveTextContent('First Section');
    expect(headings[1]).toHaveTextContent('Second Section');
    expect(headings[2]).toHaveTextContent('Third Section');

    // Each heading should have an id for in-page linking
    for (const heading of headings) {
      expect(heading).toHaveAttribute('id');
      expect(heading.getAttribute('id')).toBeTruthy();
    }
  });

  it('renders section heading IDs as URL-safe slugified values', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings[0]).toHaveAttribute('id', 'first-section');
    expect(headings[1]).toHaveAttribute('id', 'second-section');
    expect(headings[2]).toHaveAttribute('id', 'third-section');
  });

  it('renders section content as paragraph text', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(screen.getByText('Content for the first section.')).toBeInTheDocument();
    expect(screen.getByText('Content for the second section.')).toBeInTheDocument();
    expect(screen.getByText('Content for the third section.')).toBeInTheDocument();
  });

  it('renders multiple sections in correct order', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const article = screen.getByRole('article');
    const headings = within(article).getAllByRole('heading', { level: 2 });
    expect(headings[0]).toHaveTextContent('First Section');
    expect(headings[1]).toHaveTextContent('Second Section');
    expect(headings[2]).toHaveTextContent('Third Section');
  });

  it('renders empty sections array without crash', () => {
    const { container } = render(<ArticleRenderer article={EMPTY_SECTIONS_ARTICLE} />);
    expect(screen.getByRole('article')).toBeInTheDocument();
    expect(container.querySelectorAll('h2')).toHaveLength(0);
  });

  it('renders single-section article correctly', () => {
    render(<ArticleRenderer article={SINGLE_SECTION_ARTICLE} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Only Section');
    expect(screen.getByText('Only section content.')).toBeInTheDocument();
  });

  it('displays read time', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(screen.getByText(/5 min read/)).toBeInTheDocument();
  });

  it('displays last-updated date with <time> element', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const timeEl = screen.getByRole('article').querySelector('time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute('dateTime', '2026-03-01');
  });

  it('displays category badge', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
  });

  it('handles long titles without overflow', () => {
    render(<ArticleRenderer article={LONG_TITLE_ARTICLE} />);
    // ArticleRenderer does not render the title (PageHeader does)
    // but it should render without crash for articles with long titles
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('does not render any h1 elements (PageHeader provides h1)', () => {
    const { container } = render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(container.querySelectorAll('h1')).toHaveLength(0);
  });
});
