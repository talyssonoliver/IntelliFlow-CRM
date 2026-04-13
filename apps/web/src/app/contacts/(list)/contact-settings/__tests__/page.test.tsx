import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../ContactSettingsContent', () => ({
  default: () => <div data-testid="contact-settings-content">content</div>,
}));

vi.mock('../ContactSettingsLoading', () => ({
  ContactSettingsLoading: () => <div data-testid="contact-settings-loading">loading</div>,
}));

import ContactSettingsPage from '../page';

describe('Contact Settings Page (Server Component)', () => {
  it('renders ContactSettingsContent wrapped in Suspense', async () => {
    const rendered = ContactSettingsPage();
    render(rendered);
    // Suspense boundary shows fallback or content; in test env, synchronous
    // dummy component resolves immediately.
    expect(
      screen.getByTestId('contact-settings-content')
    ).toBeInTheDocument();
  });
});
