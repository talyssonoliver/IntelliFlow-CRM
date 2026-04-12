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

const BLOCKS_ARTICLE: HelpArticle = {
  ...SAMPLE_ARTICLE,
  id: 'blocks-article',
  sections: [
    {
      heading: 'Steps Section',
      content: 'Fallback content',
      blocks: [
        { type: 'paragraph', text: 'An introductory paragraph.' },
        { type: 'steps', items: ['Step one', 'Step two', 'Step three'] },
        { type: 'tip', text: 'This is a helpful tip.' },
      ],
    },
    {
      heading: 'Callouts Section',
      content: 'Fallback content',
      blocks: [
        { type: 'warning', text: 'This is an important warning.' },
        { type: 'info', text: 'This is an informational note.' },
        { type: 'nav-path', path: ['Settings', 'Integrations', 'Email'] },
      ],
    },
  ],
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
  title:
    'This Is A Very Long Article Title That Should Wrap Properly Without Causing Overflow Issues In The Layout',
};

describe('ArticleRenderer', () => {
  it('wraps content in <article> landmark element', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('renders each section heading as <h2> with id attribute', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    // Includes the "In this article" h2 from TOC + 3 section headings
    const sectionHeadings = headings.filter((h) => h.id);
    expect(sectionHeadings).toHaveLength(3);
    expect(sectionHeadings[0]).toHaveTextContent('First Section');
    expect(sectionHeadings[1]).toHaveTextContent('Second Section');
    expect(sectionHeadings[2]).toHaveTextContent('Third Section');

    for (const heading of sectionHeadings) {
      expect(heading).toHaveAttribute('id');
      expect(heading.getAttribute('id')).toBeTruthy();
    }
  });

  it('renders section heading IDs as URL-safe slugified values', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).filter((h) => h.id);
    expect(headings[0]).toHaveAttribute('id', 'first-section');
    expect(headings[1]).toHaveAttribute('id', 'second-section');
    expect(headings[2]).toHaveAttribute('id', 'third-section');
  });

  it('renders section content as paragraph text (fallback mode)', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(screen.getByText('Content for the first section.')).toBeInTheDocument();
    expect(screen.getByText('Content for the second section.')).toBeInTheDocument();
    expect(screen.getByText('Content for the third section.')).toBeInTheDocument();
  });

  it('renders multiple sections in correct order', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const article = screen.getByRole('article');
    const headings = within(article)
      .getAllByRole('heading', { level: 2 })
      .filter((h) => h.id);
    expect(headings[0]).toHaveTextContent('First Section');
    expect(headings[1]).toHaveTextContent('Second Section');
    expect(headings[2]).toHaveTextContent('Third Section');
  });

  it('renders empty sections array without crash', () => {
    const { container } = render(<ArticleRenderer article={EMPTY_SECTIONS_ARTICLE} />);
    expect(screen.getByRole('article')).toBeInTheDocument();
    const sectionHeadings = container.querySelectorAll('h2[id]');
    expect(sectionHeadings).toHaveLength(0);
  });

  it('renders single-section article correctly', () => {
    render(<ArticleRenderer article={SINGLE_SECTION_ARTICLE} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).filter((h) => h.id);
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
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('does not render any h1 elements (PageHeader provides h1)', () => {
    const { container } = render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(container.querySelectorAll('h1')).toHaveLength(0);
  });

  // ─── Table of Contents ──────────────────────────────────────────────

  it('renders table of contents for articles with 2+ sections', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    expect(screen.getByText('In this article')).toBeInTheDocument();
  });

  it('hides table of contents for single-section articles', () => {
    render(<ArticleRenderer article={SINGLE_SECTION_ARTICLE} />);
    expect(screen.queryByText('In this article')).not.toBeInTheDocument();
  });

  it('table of contents links reference section heading IDs', () => {
    render(<ArticleRenderer article={SAMPLE_ARTICLE} />);
    const tocNav = screen.getByRole('navigation', { name: 'Table of contents' });
    const links = tocNav.querySelectorAll('a');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', '#first-section');
    expect(links[1]).toHaveAttribute('href', '#second-section');
    expect(links[2]).toHaveAttribute('href', '#third-section');
  });

  // ─── Content Blocks ─────────────────────────────────────────────────

  it('renders paragraph blocks', () => {
    render(<ArticleRenderer article={BLOCKS_ARTICLE} />);
    expect(screen.getByText('An introductory paragraph.')).toBeInTheDocument();
  });

  it('renders step blocks as ordered list items', () => {
    render(<ArticleRenderer article={BLOCKS_ARTICLE} />);
    expect(screen.getByText('Step one')).toBeInTheDocument();
    expect(screen.getByText('Step two')).toBeInTheDocument();
    expect(screen.getByText('Step three')).toBeInTheDocument();
    // Check step numbers
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders tip block with "Tip" label', () => {
    render(<ArticleRenderer article={BLOCKS_ARTICLE} />);
    expect(screen.getByText('Tip')).toBeInTheDocument();
    expect(screen.getByText('This is a helpful tip.')).toBeInTheDocument();
  });

  it('renders warning block with "Important" label', () => {
    render(<ArticleRenderer article={BLOCKS_ARTICLE} />);
    expect(screen.getByText('Important')).toBeInTheDocument();
    expect(screen.getByText('This is an important warning.')).toBeInTheDocument();
  });

  it('renders info block with "Note" label', () => {
    render(<ArticleRenderer article={BLOCKS_ARTICLE} />);
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('This is an informational note.')).toBeInTheDocument();
  });

  it('renders nav-path block with path segments', () => {
    render(<ArticleRenderer article={BLOCKS_ARTICLE} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('prefers blocks over content when both are provided', () => {
    render(<ArticleRenderer article={BLOCKS_ARTICLE} />);
    // 'Fallback content' should NOT be rendered because blocks are present
    expect(screen.queryByText('Fallback content')).not.toBeInTheDocument();
  });
});
