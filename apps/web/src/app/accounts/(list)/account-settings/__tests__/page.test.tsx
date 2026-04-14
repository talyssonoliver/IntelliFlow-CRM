import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../AccountSettingsContent', () => ({
  default: () => <div data-testid="account-settings-content">content</div>,
}));

vi.mock('../AccountSettingsLoading', () => ({
  AccountSettingsLoading: () => <div data-testid="account-settings-loading">loading</div>,
}));

import AccountSettingsPage from '../page';

describe('Account Settings Page (Server Component)', () => {
  it('renders AccountSettingsContent wrapped in Suspense', () => {
    render(AccountSettingsPage());
    expect(screen.getByTestId('account-settings-content')).toBeTruthy();
  });
});
