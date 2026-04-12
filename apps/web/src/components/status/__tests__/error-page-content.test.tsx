// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorPageContent } from '../error-page-content';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('ErrorPageContent', () => {
  it('renders heading with server error text for route variant', () => {
    render(<ErrorPageContent variant="route" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/server error/i);
  });

  it('renders heading for boundary variant', () => {
    render(<ErrorPageContent variant="boundary" onReset={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/something went wrong/i);
  });

  it('renders "Go to Dashboard" link for route variant', () => {
    render(<ErrorPageContent variant="route" />);
    const link = screen.getByRole('link', { name: /dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders "Try again" button when onReset is provided (boundary)', () => {
    const resetFn = vi.fn();
    render(<ErrorPageContent variant="boundary" onReset={resetFn} />);
    const btn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(btn);
    expect(resetFn).toHaveBeenCalledOnce();
  });

  it('renders Support link', () => {
    render(<ErrorPageContent variant="route" />);
    const link = screen.getByRole('link', { name: /support/i });
    expect(link).toHaveAttribute('href', '/support');
  });

  it('shows error digest when showDetails is true and digest present', () => {
    const err = new Error('broken') as Error & { digest?: string };
    err.digest = 'xyz-789';
    render(<ErrorPageContent variant="boundary" error={err} showDetails onReset={() => {}} />);
    expect(screen.getByText(/xyz-789/)).toBeInTheDocument();
  });

  it('hides error details when showDetails is false', () => {
    const err = new Error('broken') as Error & { digest?: string };
    err.digest = 'xyz-789';
    render(
      <ErrorPageContent variant="boundary" error={err} showDetails={false} onReset={() => {}} />
    );
    expect(screen.queryByText(/xyz-789/)).not.toBeInTheDocument();
  });

  it('all interactive elements have focus:ring classes for keyboard accessibility', () => {
    const resetFn = vi.fn();
    render(<ErrorPageContent variant="boundary" onReset={resetFn} />);
    const buttons = screen.getAllByRole('button');
    const links = screen.getAllByRole('link');
    [...buttons, ...links].forEach((el) => {
      expect(el.className).toMatch(/focus:ring/);
    });
  });
});
