import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpCenterPage from '../(list)/page';

// Integration tests — render the full page with real components (no mocks)

describe('HelpCenter Integration', () => {
  it('renders search and categories together', () => {
    render(<HelpCenterPage />);
    expect(screen.getByPlaceholderText('Search help topics...')).toBeInTheDocument();
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('filtering updates card grid after debounce', async () => {
    render(<HelpCenterPage />);

    const input = screen.getByPlaceholderText('Search help topics...');
    await userEvent.type(input, 'billing');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // Should filter to show Billing (title match)
    expect(screen.getByText('Billing')).toBeInTheDocument();
    // Other categories should be hidden
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
  });

  it('clearing search restores all 8 categories', async () => {
    render(<HelpCenterPage />);

    const input = screen.getByPlaceholderText('Search help topics...');
    await userEvent.type(input, 'billing');

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
    expect(screen.getByText('Leads & Contacts')).toBeInTheDocument();
    expect(screen.getByText('Deals & Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Email & Calendar')).toBeInTheDocument();
    expect(screen.getByText('Tickets & Cases')).toBeInTheDocument();
    expect(screen.getByText('AI Features')).toBeInTheDocument();
    expect(screen.getByText('Settings & Admin')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('empty search query displays all 8 categories', () => {
    render(<HelpCenterPage />);

    // All 8 category titles visible
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Leads & Contacts')).toBeInTheDocument();
    expect(screen.getByText('Deals & Pipeline')).toBeInTheDocument();
    expect(screen.getByText('Email & Calendar')).toBeInTheDocument();
    expect(screen.getByText('Tickets & Cases')).toBeInTheDocument();
    expect(screen.getByText('AI Features')).toBeInTheDocument();
    expect(screen.getByText('Settings & Admin')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();

    // 8 category links + 1 breadcrumb link = 9 total
    const categoryLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/help-center/'));
    expect(categoryLinks.length).toBe(8);
  });

  it('partial match filters categories correctly (keyword match)', async () => {
    render(<HelpCenterPage />);

    const input = screen.getByPlaceholderText('Search help topics...');
    // "automation" is a keyword for AI Features
    await userEvent.type(input, 'automation');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(screen.getByText('AI Features')).toBeInTheDocument();
    // Other categories should not match "automation"
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();
    expect(screen.queryByText('Billing')).not.toBeInTheDocument();
  });

  it('non-matching search shows "No results found"', async () => {
    render(<HelpCenterPage />);

    const input = screen.getByPlaceholderText('Search help topics...');
    await userEvent.type(input, 'xyznonexistent');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('Escape key clears search and restores all categories', async () => {
    render(<HelpCenterPage />);

    const input = screen.getByPlaceholderText('Search help topics...');
    await userEvent.type(input, 'billing');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // Should be filtered
    expect(screen.queryByText('Getting Started')).not.toBeInTheDocument();

    // Press Escape
    await userEvent.keyboard('{Escape}');

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    // All categories restored
    expect(screen.getByText('Getting Started')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('popular categories appear first in default order', () => {
    render(<HelpCenterPage />);

    // Filter to only category links (exclude breadcrumb links)
    const categoryLinks = screen
      .getAllByRole('link')
      .filter((l) => l.getAttribute('href')?.startsWith('/help-center/'));
    // First 3 should be popular: getting-started, leads-contacts, deals-pipeline
    expect(categoryLinks[0]).toHaveAttribute('href', '/help-center/getting-started');
    expect(categoryLinks[1]).toHaveAttribute('href', '/help-center/leads-contacts');
    expect(categoryLinks[2]).toHaveAttribute('href', '/help-center/deals-pipeline');
  });
});
