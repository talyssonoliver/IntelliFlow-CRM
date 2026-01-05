/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnboardingFlow, DEFAULT_ONBOARDING_STEPS, type OnboardingStep } from '../onboarding-flow';

// Mock tracking functions
vi.mock('@/lib/shared/tracking-pixel', () => ({
  trackOnboardingStep: vi.fn(),
  trackOnboardingComplete: vi.fn(),
}));

describe('OnboardingFlow', () => {
  const mockOnStepComplete = vi.fn();
  const mockOnAllComplete = vi.fn();

  beforeEach(() => {
    mockOnStepComplete.mockClear();
    mockOnAllComplete.mockClear();
  });

  it('renders default onboarding steps', () => {
    render(<OnboardingFlow />);

    expect(screen.getByText('Verify your email')).toBeInTheDocument();
    expect(screen.getByText('Complete your profile')).toBeInTheDocument();
    expect(screen.getByText('Import your contacts')).toBeInTheDocument();
    expect(screen.getByText('Explore features')).toBeInTheDocument();
  });

  it('renders custom steps when provided', () => {
    const customSteps: OnboardingStep[] = [
      {
        id: 'step-1',
        title: 'Custom Step 1',
        description: 'Description 1',
        icon: 'star',
      },
      {
        id: 'step-2',
        title: 'Custom Step 2',
        description: 'Description 2',
        icon: 'favorite',
      },
    ];

    render(<OnboardingFlow steps={customSteps} />);

    expect(screen.getByText('Custom Step 1')).toBeInTheDocument();
    expect(screen.getByText('Custom Step 2')).toBeInTheDocument();
    expect(screen.queryByText('Verify your email')).not.toBeInTheDocument();
  });

  it('shows progress bar when showProgress is true', () => {
    render(<OnboardingFlow showProgress={true} />);

    expect(screen.getByText(/0 of 4 steps completed/)).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('hides progress bar when showProgress is false', () => {
    render(<OnboardingFlow showProgress={false} />);

    expect(screen.queryByText(/steps completed/)).not.toBeInTheDocument();
  });

  it('marks optional steps with Optional badge', () => {
    render(<OnboardingFlow />);

    const optionalBadges = screen.getAllByText('Optional');
    expect(optionalBadges.length).toBeGreaterThan(0);
  });

  it('highlights active step', () => {
    render(<OnboardingFlow currentStep={1} />);

    // The second step should be active (Complete your profile)
    const profileStepTitle = screen.getByText('Complete your profile');
    expect(profileStepTitle).toHaveClass('text-white');
  });

  it('shows action buttons for steps with actions', () => {
    render(<OnboardingFlow />);

    expect(screen.getByRole('button', { name: /resend email/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /complete profile/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /import contacts/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start tour/i })).toBeInTheDocument();
  });

  it('calls onStepComplete when step is completed', async () => {
    const user = userEvent.setup();
    render(
      <OnboardingFlow
        onStepComplete={mockOnStepComplete}
        currentStep={0}
      />
    );

    // Click the "Resend email" button (first step action with no href)
    await user.click(screen.getByRole('button', { name: /resend email/i }));

    expect(mockOnStepComplete).toHaveBeenCalledWith('verify-email', 0);
  });

  it('updates progress when steps are completed', async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow currentStep={0} />);

    expect(screen.getByText('0%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /resend email/i }));

    await waitFor(() => {
      expect(screen.getByText('25%')).toBeInTheDocument();
    });
  });

  it('shows completed indicator for finished steps', async () => {
    const stepsWithCompleted: OnboardingStep[] = [
      {
        id: 'step-1',
        title: 'Completed Step',
        description: 'This step is done',
        icon: 'check',
        completed: true,
      },
      {
        id: 'step-2',
        title: 'Pending Step',
        description: 'This step is pending',
        icon: 'pending',
      },
    ];

    render(<OnboardingFlow steps={stepsWithCompleted} />);

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders in horizontal variant', () => {
    render(<OnboardingFlow variant="horizontal" />);

    // Check that the grid layout is applied
    const stepsContainer = screen.getByRole('navigation', { name: /onboarding steps/i })
      .querySelector('.grid');
    expect(stepsContainer).toBeInTheDocument();
  });

  it('renders in vertical variant by default', () => {
    render(<OnboardingFlow />);

    // Vertical variant should not have grid class
    const stepsContainer = screen.getByRole('navigation', { name: /onboarding steps/i })
      .querySelector('.space-y-0');
    expect(stepsContainer).toBeInTheDocument();
  });

  it('shows skip link when some steps are completed', async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow currentStep={0} />);

    // Initially, no skip link
    expect(screen.queryByText(/skip for now/i)).not.toBeInTheDocument();

    // Complete a step
    await user.click(screen.getByRole('button', { name: /resend email/i }));

    // Now skip link should appear
    await waitFor(() => {
      expect(screen.getByText(/skip for now and go to dashboard/i)).toBeInTheDocument();
    });
  });

  it('has accessible navigation landmark', () => {
    render(<OnboardingFlow />);

    expect(screen.getByRole('navigation', { name: /onboarding steps/i })).toBeInTheDocument();
  });

  it('uses aria-hidden for decorative icons', () => {
    render(<OnboardingFlow />);

    const icons = document.querySelectorAll('.material-symbols-outlined');
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('handles steps with href actions as links', () => {
    render(<OnboardingFlow currentStep={1} />);

    const profileLink = screen.getByRole('link', { name: /complete profile/i });
    expect(profileLink).toHaveAttribute('href', '/settings/profile');
  });

  it('applies custom className', () => {
    const { container } = render(<OnboardingFlow className="custom-class" />);

    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});

describe('DEFAULT_ONBOARDING_STEPS', () => {
  it('has 4 default steps', () => {
    expect(DEFAULT_ONBOARDING_STEPS).toHaveLength(4);
  });

  it('has unique step IDs', () => {
    const ids = DEFAULT_ONBOARDING_STEPS.map((step) => step.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('has required properties for each step', () => {
    DEFAULT_ONBOARDING_STEPS.forEach((step) => {
      expect(step.id).toBeDefined();
      expect(step.title).toBeDefined();
      expect(step.description).toBeDefined();
      expect(step.icon).toBeDefined();
    });
  });

  it('marks import-contacts and explore-features as optional', () => {
    const optionalSteps = DEFAULT_ONBOARDING_STEPS.filter((step) => step.optional);
    expect(optionalSteps).toHaveLength(2);
    expect(optionalSteps.map((s) => s.id)).toContain('import-contacts');
    expect(optionalSteps.map((s) => s.id)).toContain('explore-features');
  });
});
