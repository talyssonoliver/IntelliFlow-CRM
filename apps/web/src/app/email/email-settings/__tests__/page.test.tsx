import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../EmailSettingsContent', () => ({
  default: () => <div data-testid="content-stub">content</div>,
}));
vi.mock('../EmailSettingsLoading', () => ({
  EmailSettingsLoading: () => <div data-testid="loading-stub">loading</div>,
}));

import Page, { metadata } from '../page';

describe('Email Settings page.tsx', () => {
  it('exports metadata', () => {
    expect(metadata.title).toMatch(/Email Settings/);
    expect(metadata.description).toMatch(/mailbox/i);
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
