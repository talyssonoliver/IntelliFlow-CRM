/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../EditAccountForm', () => ({
  default: ({ accountId }: { accountId: string }) => (
    <div data-testid="edit-account-form">{accountId}</div>
  ),
}));

import EditAccountPage from '../page';

describe('/accounts/[id]/edit page', () => {
  it('renders the edit form for the route id', async () => {
    render(await EditAccountPage({ params: Promise.resolve({ id: 'acc-7' }) }));
    expect(screen.getByTestId('edit-account-form').textContent).toBe('acc-7');
  });
});
