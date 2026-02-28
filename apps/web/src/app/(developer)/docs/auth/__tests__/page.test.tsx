import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthGuidesPage, { metadata } from '../page';

// Mock AuthGuides to isolate page tests
vi.mock('@/components/developer/auth-guides', () => ({
  AuthGuides: () => <div data-testid="auth-guides">Auth Guides Mock</div>,
}));

describe('AuthGuidesPage', () => {
  it('renders h1 heading "Authentication"', () => {
    render(<AuthGuidesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Authentication');
  });

  it('renders description paragraph about authentication', () => {
    render(<AuthGuidesPage />);
    const description = screen.getByText(/secure access.*identity management/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders AuthGuides component via mock', () => {
    render(<AuthGuidesPage />);
    expect(screen.getByTestId('auth-guides')).toBeInTheDocument();
  });

  it('exports metadata.title as "Authentication | IntelliFlow CRM"', () => {
    expect(metadata.title).toBe('Authentication | IntelliFlow CRM');
  });

  it('exports metadata.description containing "authentication"', () => {
    expect(metadata.description).toMatch(/authentication/i);
  });

  it('page function is synchronous (Server Component check)', () => {
    expect(AuthGuidesPage.constructor.name).not.toBe('AsyncFunction');
  });

  it('layout wrapper has "flex flex-col gap-6" classes', () => {
    const { container } = render(<AuthGuidesPage />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content constrained within "max-w-5xl" container', () => {
    const { container } = render(<AuthGuidesPage />);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('accessible h1 landmark (visible, non-empty)', () => {
    render(<AuthGuidesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('no orphan h2 headings at page level', () => {
    render(<AuthGuidesPage />);
    const h2s = screen.queryAllByRole('heading', { level: 2 });
    // With the mocked AuthGuides, there should be no h2s
    expect(h2s.length).toBe(0);
  });
});
