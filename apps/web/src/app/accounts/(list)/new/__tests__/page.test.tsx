/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../NewAccountForm', () => ({
  default: () => <div data-testid="new-account-form" />,
}));

import NewAccountPage from '../page';

describe('/accounts/new page', () => {
  it('renders the new account form', () => {
    render(<NewAccountPage />);
    expect(screen.getByTestId('new-account-form')).toBeDefined();
  });
});
