import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../OAuthCallbackContent', () => ({
  default: () => <div data-testid="content-stub">content</div>,
}));

import Page, { metadata } from '../page';

describe('OAuth callback page.tsx', () => {
  it('exports metadata and keeps the page out of search indexes', () => {
    expect(metadata.title).toMatch(/Connecting/);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('renders the content inside Suspense', () => {
    render(<Page />);
    expect(screen.getByTestId('content-stub')).toBeInTheDocument();
  });

  it('is a server component (no "use client")', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');
    expect(src).not.toMatch(/'use client'/);
  });
});
