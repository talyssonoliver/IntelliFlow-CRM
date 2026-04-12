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

vi.mock('@/components/status/server-incident-reporter', () => ({
  ServerIncidentReporter: (props: Record<string, unknown>) => (
    <span data-testid="server-incident-reporter" data-path={props.path} />
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

  it('mounts ServerIncidentReporter with path="/500"', () => {
    render(<ServerErrorPage />);
    const reporter = screen.getByTestId('server-incident-reporter');
    expect(reporter).toBeInTheDocument();
    expect(reporter).toHaveAttribute('data-path', '/500');
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
