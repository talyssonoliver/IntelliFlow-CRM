import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../AccountTiersContent', () => ({
  default: () => <div data-testid="account-tiers-content" />,
}));

import AccountTiersPage from '../page';

describe('Account Tiers page (PG-196)', () => {
  it('renders the real tiers page, not the old "coming soon" stub', () => {
    render(<AccountTiersPage />);
    expect(screen.getByTestId('account-tiers-content')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
