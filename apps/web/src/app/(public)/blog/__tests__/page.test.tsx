/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BlogIndexPage from '../page';
import { blogPosts } from '@/data/blog-posts';

describe('Blog index page', () => {
  it('lists only published posts, and none are published yet', () => {
    expect(Object.keys(blogPosts)).toHaveLength(0);
  });

  it('serves no post page for a slug outside the published list', async () => {
    const postPage = await import('../[slug]/page');
    expect(postPage.dynamicParams).toBe(false);
    expect(postPage.generateStaticParams()).toEqual([]);
  });

  it('shows an empty state instead of sample posts, categories or pagination', () => {
    const { container } = render(<BlogIndexPage />);

    expect(screen.getByRole('heading', { name: 'No posts yet' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Blog categories' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Featured Articles' })).toBeNull();
    expect(container.querySelector('a[href^="/blog/"]')).toBeNull();
  });

  it('offers no newsletter signup, since nothing receives the address', () => {
    const { container } = render(<BlogIndexPage />);
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Subscribe' })).toBeNull();
  });

  it('names no invented authors or customer results', () => {
    const { container } = render(<BlogIndexPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/Sarah Chen|Michael Torres|James Wright|Emily Park|Voltstack/);
    expect(text).not.toContain('%');
    expect(text.toLowerCase()).not.toContain('increased conversions');
  });
});
