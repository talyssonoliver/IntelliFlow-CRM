/**
 * @vitest-environment happy-dom
 */
import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { TourConfig } from '@intelliflow/validators';

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
let currentSearchParams = mockSearchParams;

vi.mock('next/navigation', () => ({
  useSearchParams: () => currentSearchParams,
  usePathname: () => '/features',
}));

// Mock tracking-pixel to avoid DOM side effects
const trackOnboardingStep = vi.fn();
const trackOnboardingComplete = vi.fn();
const trackTourStarted = vi.fn();
const trackTourSkipped = vi.fn();

vi.mock('@/lib/shared/tracking-pixel', () => ({
  trackOnboardingStep: (...args: unknown[]) => trackOnboardingStep(...args),
  trackOnboardingComplete: (...args: unknown[]) => trackOnboardingComplete(...args),
  trackTourStarted: (...args: unknown[]) => trackTourStarted(...args),
  trackTourSkipped: (...args: unknown[]) => trackTourSkipped(...args),
}));

import {
  TourProvider,
  PublicTour,
  TourTriggerButton,
  useTourState,
} from '../tour-components';
import { getTourSeenAt, markTourSeen } from '@/lib/public/tour-storage';

const TEST_CONFIG: TourConfig = {
  id: 'test-tour',
  route: '/features',
  steps: [
    {
      id: 'step-1',
      targetSelector: '[data-test-target="a"]',
      title: 'First',
      description: 'First step description',
    },
    {
      id: 'step-2',
      targetSelector: '[data-test-target="b"]',
      title: 'Second',
      description: 'Second step description',
    },
    {
      id: 'step-3',
      targetSelector: '[data-test-target="c"]',
      title: 'Third',
      description: 'Third step description',
    },
  ],
};

function TargetFixture() {
  // Rendered inside the React tree so RTL cleanup owns its lifecycle.
  return (
    <div data-testid="target-fixture">
      <div data-test-target="a" style={{ width: 100, height: 50 }}>A</div>
      <div data-test-target="b" style={{ width: 100, height: 50 }}>B</div>
      <div data-test-target="c" style={{ width: 100, height: 50 }}>C</div>
    </div>
  );
}

function Harness({
  config = TEST_CONFIG,
  disableAutoStart = false,
}: {
  config?: TourConfig;
  disableAutoStart?: boolean;
}) {
  return (
    <TourProvider config={config} disableAutoStart={disableAutoStart}>
      <TargetFixture />
      <PublicTour />
    </TourProvider>
  );
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  currentSearchParams = new URLSearchParams();
  trackOnboardingStep.mockClear();
  trackOnboardingComplete.mockClear();
  trackTourStarted.mockClear();
  trackTourSkipped.mockClear();
});


describe('TourProvider auto-start', () => {
  it('auto-starts for first-visit visitor with no seen flag and no reduced motion', async () => {
    render(<Harness />);
    // Wait for useEffect
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // Tour should be active — step-1 title visible
    expect(screen.getByText('First')).toBeDefined();
    expect(trackTourStarted).toHaveBeenCalledWith({
      tourId: 'test-tour',
      totalSteps: 3,
    });
  });

  it('does NOT auto-start when seen flag is present', async () => {
markTourSeen('test-tour');
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(trackTourStarted).not.toHaveBeenCalled();
  });

  it('?tour=1 overrides the seen flag', async () => {
markTourSeen('test-tour');
    currentSearchParams = new URLSearchParams('tour=1');
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(trackTourStarted).toHaveBeenCalledWith({
      tourId: 'test-tour',
      totalSteps: 3,
    });
  });

  it('respects prefers-reduced-motion (no auto-start)', async () => {
const origMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })) as typeof window.matchMedia;
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(trackTourStarted).not.toHaveBeenCalled();
    window.matchMedia = origMatchMedia;
  });

  it('disableAutoStart prop skips auto-start', async () => {
    render(<Harness disableAutoStart />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(trackTourStarted).not.toHaveBeenCalled();
  });
});

describe('Tour step transitions', () => {
  it('Next advances through steps and fires step events', async () => {
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(screen.getByText('First')).toBeDefined();

    // Click Next — advances to step-2
    const nextButton = screen.getByTestId('tour-next-button');
    await act(async () => {
      fireEvent.click(nextButton);
    });
    expect(screen.getByText('Second')).toBeDefined();
    expect(trackOnboardingStep).toHaveBeenCalledWith({
      step: 1,
      stepName: 'First',
      totalSteps: 3,
    });

    // Advance to step-3
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-next-button'));
    });
    expect(screen.getByText('Third')).toBeDefined();

    // Click Done on final step — completes
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-next-button'));
    });

    expect(trackOnboardingComplete).toHaveBeenCalled();
    // Seen flag is set
    expect(getTourSeenAt('test-tour')).not.toBeNull();
  });

  it('Skip closes the tour and fires trackTourSkipped (does NOT set seen flag)', async () => {
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-skip-button'));
    });

    expect(trackTourSkipped).toHaveBeenCalledWith({
      tourId: 'test-tour',
      stepIndex: 0,
      totalSteps: 3,
    });
    expect(getTourSeenAt('test-tour')).toBeNull();
  });

  it('Previous goes back and disables on step-1', async () => {
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    // On step-1: previous is disabled
    const prev = screen.getByTestId('tour-previous-button') as HTMLButtonElement;
    expect(prev.disabled).toBe(true);

    // Advance
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-next-button'));
    });
    // On step-2: previous is enabled
    expect(
      (screen.getByTestId('tour-previous-button') as HTMLButtonElement).disabled
    ).toBe(false);
    // Go back
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-previous-button'));
    });
    expect(screen.getByText('First')).toBeDefined();
  });
});

describe('a11y + dialog shape', () => {
  it('step dialog has role=dialog, aria-labelledby, aria-describedby', async () => {
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const dialog = screen.getByTestId('tour-step-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();

    // Dialog z-index = 60 (feedback widget dialog sits at 60 too; FAB is 50;
    // Tour spotlight at 40)
    expect(dialog.style.zIndex).toBe('60');
  });

  it('spotlight element renders at z-index 40', async () => {
    render(<Harness />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const spotlight = document.querySelector(
      '[data-testid="tour-spotlight"], [data-testid="tour-spotlight-fallback"]'
    ) as HTMLElement | null;
    expect(spotlight).not.toBeNull();
    expect(spotlight?.style.zIndex).toBe('40');
  });

  it('renders fallback spotlight when target selector does not match', async () => {
    const config: TourConfig = {
      ...TEST_CONFIG,
      steps: [
        {
          id: 'missing',
          targetSelector: '[data-test-target="MISSING"]',
          title: 'Missing',
          description: 'This step has no target',
        },
      ],
    };
    render(<Harness config={config} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(
      document.querySelector('[data-testid="tour-spotlight-fallback"]')
    ).not.toBeNull();
  });
});

describe('TourTriggerButton', () => {
  it('renders as link when href provided', () => {
    render(<TourTriggerButton tourId="features-v1" href="/features" />);
    const link = screen.getByTestId('tour-trigger-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/features?tour=1');
    expect(link.getAttribute('data-tour-id')).toBe('features-v1');
  });

  it('appends & when href already has query', () => {
    render(
      <TourTriggerButton tourId="features-v1" href="/features?utm=x" />
    );
    const link = screen.getByTestId('tour-trigger-link') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/features?utm=x&tour=1');
  });

  it('renders as inline button when no href (inside provider)', async () => {
    render(
      <TourProvider config={TEST_CONFIG} disableAutoStart>
        <TourTriggerButton tourId="features-v1" />
      </TourProvider>
    );
    const button = screen.getByTestId('tour-trigger-button');
    expect(button).toBeDefined();
    // Clicking starts the tour
    await act(async () => {
      fireEvent.click(button);
    });
    expect(trackTourStarted).toHaveBeenCalled();
  });
});

describe('useTourState outside provider', () => {
  it('throws when called outside <TourProvider>', () => {
    function Bad() {
      useTourState();
      return null;
    }
    // Silence expected React error logging
    const origErr = console.error;
    console.error = () => {};
    expect(() => render(<Bad />)).toThrow();
    console.error = origErr;
  });
});
