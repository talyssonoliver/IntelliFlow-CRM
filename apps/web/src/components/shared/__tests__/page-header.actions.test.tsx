/**
 * PageHeader actions — #1225 UI-010: a label hidden on phones must not leave
 * the control without an accessible name.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PageHeader } from '../page-header';

describe('PageHeader actions with hideOnMobile', () => {
  it('names an icon-only link and button and gives them a tooltip', () => {
    render(
      <PageHeader
        title="Dashboard"
        actions={[
          { label: 'Customize', icon: 'tune', href: '/dashboard/customize', hideOnMobile: true },
          { label: 'Refresh', icon: 'refresh', onClick: vi.fn(), hideOnMobile: true },
        ]}
      />
    );

    const link = screen.getByRole('link', { name: 'Customize' });
    expect(link).toHaveAttribute('aria-label', 'Customize');
    expect(link).toHaveAttribute('title', 'Customize');

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveAttribute('aria-label', 'Refresh');
    expect(button).toHaveAttribute('title', 'Refresh');
    // The visible label is still there for sm and up.
    expect(screen.getByText('Refresh')).toHaveClass('hidden', 'sm:inline');
  });

  it('adds no aria-label when the label always shows, or there is no icon', () => {
    render(
      <PageHeader
        title="Leads"
        actions={[
          { label: 'Add Lead', icon: 'add', href: '/leads/new', variant: 'primary' },
          { label: 'Reset', onClick: vi.fn(), hideOnMobile: true },
        ]}
      />
    );

    expect(screen.getByRole('link', { name: 'Add Lead' })).not.toHaveAttribute('aria-label');
    expect(screen.getByRole('button', { name: 'Reset' })).not.toHaveAttribute('aria-label');
  });
});
