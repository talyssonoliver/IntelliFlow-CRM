/**
 * @vitest-environment jsdom
 *
 * The wrapper exists solely to lazy-load OnboardingWelcome (and its @stripe/*
 * imports) on the client, out of the universal root-layout compile graph. The
 * next/dynamic loader is stubbed so the heavy module (and Stripe) is never
 * imported in the test; we only assert the wrapper exposes a renderable client
 * component.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/dynamic', () => ({
  __esModule: true,
  default: () =>
    function OnboardingStub() {
      return <div data-testid="onboarding-welcome">Onboarding</div>;
    },
}));

import { OnboardingWelcome } from '../OnboardingWelcomeClient';

describe('OnboardingWelcomeClient', () => {
  it('exposes a client-only, lazily-loaded OnboardingWelcome', () => {
    render(<OnboardingWelcome />);
    expect(screen.getByTestId('onboarding-welcome')).toBeInTheDocument();
  });
});
