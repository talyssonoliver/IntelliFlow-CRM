// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from '../page-header';

describe('Breadcrumbs', () => {
  it('wraps whole items on a narrow screen', () => {
    render(<Breadcrumbs items={[{ label: 'Help', href: '/help' }, { label: 'A long article' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('flex-wrap');
  });
});

describe('PageHeader breadcrumb trail (#1222 UI-011)', () => {
  it('shows the ancestors only: the title is not repeated', async () => {
    const { PageHeader } = await import('../page-header');
    render(
      <PageHeader
        title="All Leads"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Leads', href: '/leads' },
          { label: 'All Leads' },
        ]}
      />
    );
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav).toHaveTextContent('Home');
    expect(nav).toHaveTextContent('Leads');
    expect(nav).not.toHaveTextContent('All Leads');
    // Every ancestor keeps its link, the last one included.
    expect(screen.getByRole('link', { name: 'Leads' })).toHaveAttribute('href', '/leads');
    expect(nav.querySelector('[aria-current]')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('All Leads');
  });

  it('renders no trail when the only crumb is the page itself', async () => {
    const { PageHeader } = await import('../page-header');
    render(<PageHeader title="Home" breadcrumbs={[{ label: 'Home' }]} />);
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });
});

describe('breadcrumbAncestors', () => {
  it('drops a last crumb that is the current page', async () => {
    const { breadcrumbAncestors } = await import('../page-header');
    const home = { label: 'Home', href: '/' };
    expect(breadcrumbAncestors(undefined, 'X')).toEqual([]);
    expect(breadcrumbAncestors([home, { label: 'Leads' }], 'Leads')).toEqual([home]);
    // Linked but named like the title: still the current page.
    expect(breadcrumbAncestors([home, { label: 'Leads', href: '/leads' }], 'Leads')).toEqual([
      home,
    ]);
    // A linked last crumb with another name is an ancestor: kept.
    const parent = { label: 'Settings', href: '/settings' };
    expect(breadcrumbAncestors([home, parent], 'Pipeline')).toEqual([home, parent]);
  });
});
