import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SdkGuidesPage, { metadata } from '../page';

// Mock SdkGuides to isolate page tests
vi.mock('@/components/developer/sdk-guides', () => ({
  SdkGuides: () => <div data-testid="sdk-guides">SDK Guides Mock</div>,
}));

describe('SdkGuidesPage', () => {
  it('renders h1 heading "SDK Guides" (AC-001)', () => {
    render(<SdkGuidesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SDK Guides');
  });

  it('renders description paragraph containing "SDK" (AC-001)', () => {
    render(<SdkGuidesPage />);
    const description = screen.getByText(/Client libraries and developer tools/i);
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe('P');
  });

  it('renders SdkGuides component via data-testid="sdk-guides" mock (AC-001)', () => {
    render(<SdkGuidesPage />);
    expect(screen.getByTestId('sdk-guides')).toBeInTheDocument();
  });

  it('exports metadata.title as "SDK Guides | IntelliFlow CRM" (AC-002)', () => {
    expect(metadata.title).toBe('SDK Guides | IntelliFlow CRM');
  });

  it('exports metadata.description containing "SDK" (AC-002)', () => {
    expect(metadata.description).toMatch(/SDK/i);
  });

  it('page function is synchronous (Server Component check)', () => {
    expect(SdkGuidesPage.constructor.name).not.toBe('AsyncFunction');
  });

  it('layout wrapper has "flex flex-col gap-6" classes', () => {
    const { container } = render(<SdkGuidesPage />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('flex');
    expect(wrapper?.className).toContain('flex-col');
    expect(wrapper?.className).toContain('gap-6');
  });

  it('content constrained within "max-w-5xl" container', () => {
    const { container } = render(<SdkGuidesPage />);
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeInTheDocument();
  });

  it('accessible h1 landmark (visible, non-empty text) (NF-005)', () => {
    render(<SdkGuidesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('no orphan h2 headings at page level', () => {
    render(<SdkGuidesPage />);
    const h2s = screen.queryAllByRole('heading', { level: 2 });
    // With the mocked SdkGuides, there should be no h2s
    expect(h2s.length).toBe(0);
  });
});
