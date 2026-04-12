import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GuidesPage, { metadata } from '../page';

vi.mock('@/components/developer/guides-list', () => ({
  GuidesList: () => <div data-testid="guides-list">Guides List Mock</div>,
}));

describe('GuidesPage', () => {
  it('renders h1 heading "Developer Guides" (AC-001)', () => {
    render(<GuidesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Developer Guides');
  });

  it('renders description paragraph with "guides" text (AC-001)', () => {
    render(<GuidesPage />);
    const description = screen.getByText(/Browse developer guides/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders GuidesList component via data-testid mock (AC-001)', () => {
    render(<GuidesPage />);
    expect(screen.getByTestId('guides-list')).toBeInTheDocument();
  });

  it('exports metadata.title as "Developer Guides | IntelliFlow CRM" (AC-001)', () => {
    expect(metadata.title).toBe('Developer Guides | IntelliFlow CRM');
  });

  it('exports metadata.description containing "guides" (AC-001)', () => {
    expect(metadata.description).toMatch(/guide/i);
  });

  it('page function is synchronous (Server Component check) (AC-008)', () => {
    expect(GuidesPage.constructor.name).not.toBe('AsyncFunction');
  });

  it('layout wrapper has "flex flex-col gap-6" classes', () => {
    const { container } = render(<GuidesPage />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content constrained within "max-w-5xl" container', () => {
    const { container } = render(<GuidesPage />);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('accessible h1 landmark (visible, non-empty text) (NF-003)', () => {
    render(<GuidesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('no orphan h2 headings at page level', () => {
    render(<GuidesPage />);
    const h2s = screen.queryAllByRole('heading', { level: 2 });
    expect(h2s.length).toBe(0);
  });
});
