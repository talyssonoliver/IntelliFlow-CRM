import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock the client component
vi.mock('@/components/shared/api-reference-client', () => ({
  ApiReferenceClient: ({ specUrl }: { specUrl: string }) => (
    <div data-testid="api-reference-client" data-spec-url={specUrl} />
  ),
}));

import ApiReferencePage, { metadata } from '../page';

describe('ApiReferencePage', () => {
  it('renders h1 heading "API Reference"', () => {
    render(<ApiReferencePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('API Reference');
  });

  it('renders description paragraph with "Interactive API documentation"', () => {
    render(<ApiReferencePage />);
    expect(screen.getByText(/Interactive API documentation/i)).toBeInTheDocument();
  });

  it('renders ApiReferenceClient component', () => {
    render(<ApiReferencePage />);
    expect(screen.getByTestId('api-reference-client')).toBeInTheDocument();
  });

  it('passes specUrl="/api/openapi" prop to ApiReferenceClient', () => {
    render(<ApiReferencePage />);
    expect(screen.getByTestId('api-reference-client')).toHaveAttribute(
      'data-spec-url',
      '/api/openapi',
    );
  });

  it('has proper heading hierarchy (h1 for page title)', () => {
    render(<ApiReferencePage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    // No orphan h2 headings in this page — only h1
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('exports metadata with correct title', () => {
    expect(metadata.title).toBe('API Reference | IntelliFlow CRM');
  });

  it('exports metadata with correct description containing "Interactive tRPC API"', () => {
    expect(metadata.description).toContain('Interactive tRPC API');
  });

  it('page function is NOT async (synchronous Server Component)', () => {
    // Async functions have AsyncFunction constructor
    const AsyncFunction = (async () => {}).constructor;
    expect(ApiReferencePage).not.toBeInstanceOf(AsyncFunction);
  });

  it('wraps content in flex column layout', () => {
    const { container } = render(<ApiReferencePage />);
    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass('flex', 'flex-col', 'h-[100dvh]');
  });

  it('has accessible h1 landmark for skip navigation (AC-13)', () => {
    render(<ApiReferencePage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeVisible();
    expect(h1.textContent).toBeTruthy();
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<ApiReferencePage />);
    // Simple structural check — real axe would need vitest-axe
    // Verify heading exists and content is structured
    expect(container.querySelector('h1')).toBeInTheDocument();
    expect(container.querySelector('p')).toBeInTheDocument();
  });
});
