// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import ServerErrorPage, { metadata } from '../page';

describe('ServerErrorPage', () => {
  it('renders heading for the 500 experience', () => {
    render(<ServerErrorPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/server error/i);
  });

  it('renders recovery actions (Dashboard + Home links)', () => {
    render(<ServerErrorPage />);
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
  });

  it('does NOT mount ServerIncidentReporter on direct /500 navigation', () => {
    render(<ServerErrorPage />);
    expect(screen.queryByTestId('server-incident-reporter')).not.toBeInTheDocument();
  });
});

describe('metadata', () => {
  it('has correct title', () => {
    expect(metadata.title).toBe('Server Error | IntelliFlow CRM');
  });

  it('has robots noindex nofollow', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('has canonical /500', () => {
    expect(metadata.alternates?.canonical).toBe('/500');
  });
});
