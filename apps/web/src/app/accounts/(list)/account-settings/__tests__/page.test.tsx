import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// next/dynamic is mocked to render the loading fallback so we can assert on it
// without booting the full tRPC-backed content component.
vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: (_loader: unknown, opts: { loading?: () => React.ReactNode }) => {
    return () => <>{opts?.loading?.()}</>;
  },
}));

import AccountSettingsPage from '../page';

describe('AccountSettingsPage', () => {
  it('renders the dynamic loading skeleton on first paint', () => {
    const { container } = render(<AccountSettingsPage />);
    // Loading skeleton contains multiple Skeleton placeholders — not text.
    // Use the card container structure.
    expect(container.firstChild).toBeTruthy();
    // The skeleton includes at least 4 breadcrumb/header/skeleton bars
    expect(container.querySelectorAll('div').length).toBeGreaterThan(3);
  });

  it('does not throw when imported', () => {
    expect(AccountSettingsPage).toBeTypeOf('function');
  });
});
