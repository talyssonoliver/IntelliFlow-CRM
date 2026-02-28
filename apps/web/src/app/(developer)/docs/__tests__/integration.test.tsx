import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DocsPage from '../page';

// Integration tests — render the full page with real components (no mocks)

describe('DocsPage Integration', () => {
  it('renders search and navigation together', () => {
    render(<DocsPage />);
    expect(screen.getByPlaceholderText('Search documentation...')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
  });

  it('filtering updates card grid', async () => {
    render(<DocsPage />);

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'api');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // Should filter to show API Reference (title match)
    expect(screen.getByText('API Reference')).toBeInTheDocument();
    // Architecture should be hidden (no "api" match)
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
  });

  it('clearing search restores all categories', async () => {
    render(<DocsPage />);

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'architecture');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // Clear search
    await userEvent.clear(input);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // All categories should be visible again
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('API Reference')).toBeInTheDocument();
    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('Developer Guides')).toBeInTheDocument();
    expect(screen.getByText('Integration Resources')).toBeInTheDocument();
    expect(screen.getByText('Changelog & Updates')).toBeInTheDocument();
  });

  it('empty search query displays all 6 categories but not all as links', () => {
    render(<DocsPage />);

    // All 6 categories should be visible
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('API Reference')).toBeInTheDocument();
    expect(screen.getByText('Architecture')).toBeInTheDocument();
    expect(screen.getByText('Developer Guides')).toBeInTheDocument();
    expect(screen.getByText('Integration Resources')).toBeInTheDocument();
    expect(screen.getByText('Changelog & Updates')).toBeInTheDocument();

    // API Reference, Integration Resources, and Changelog are active internal links
    const links = screen.queryAllByRole('link');
    expect(links.length).toBe(3);
    expect(links[0]).toHaveAttribute('href', '/docs/api');
    expect(links[1]).toHaveAttribute('href', '/docs/integrations');
    expect(links[2]).toHaveAttribute('href', '/docs/changelog');
  });

  it('partial match filters categories correctly', async () => {
    render(<DocsPage />);

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'guide');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // "Developer Guides" should match (title), "Changelog" has "guides" in description
    expect(screen.getByText('Developer Guides')).toBeInTheDocument();
  });

  it('changelog category is now an active link (no longer Coming Soon)', async () => {
    render(<DocsPage />);

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'changelog');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(screen.getByText('Changelog & Updates')).toBeInTheDocument();

    // Changelog should now be a clickable link
    const links = screen.queryAllByRole('link');
    const changelogLink = links.find((l) => l.textContent?.includes('Changelog'));
    expect(changelogLink).toBeDefined();
    expect(changelogLink).toHaveAttribute('href', '/docs/changelog');
  });

  it('no results state shows message', async () => {
    render(<DocsPage />);

    const input = screen.getByPlaceholderText('Search documentation...');
    await userEvent.type(input, 'xyznonexistent');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(screen.getByText(/no results found for/i)).toBeInTheDocument();
  });

  it('search is accessible with role and aria-label', () => {
    render(<DocsPage />);

    expect(screen.getByRole('search')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Search documentation...');
    expect(input).toHaveAttribute('aria-label', 'Search documentation');
  });
});
