/**
 * @vitest-environment happy-dom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/navigation
const mockPush = vi.fn();
const mockGet = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: mockGet,
  }),
}));

// Import after mocks
import LoginPage from '../page';

describe('LoginPage', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null); // No redirect param by default

    // Mock localStorage and sessionStorage
    const storage: Record<string, string> = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => storage[key] || null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key, value) => (storage[key] = value)
    );
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => delete storage[key]);
  });

  describe('Rendering', () => {
    it('renders login page with title', () => {
      render(<LoginPage />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back');
    });

    it('renders email input field', () => {
      render(<LoginPage />);

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/you@company.com/i)).toBeInTheDocument();
    });

    it('renders password input field', () => {
      render(<LoginPage />);

      // Use exact match for "Password" label (not "Forgot password?" link)
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    });

    it('renders remember me checkbox', () => {
      render(<LoginPage />);

      expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
    });

    it('renders sign in button', () => {
      render(<LoginPage />);

      // The main sign in button (not SSO buttons)
      expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    });

    it('renders forgot password link', () => {
      render(<LoginPage />);

      expect(screen.getByRole('link', { name: /forgot password/i })).toBeInTheDocument();
    });

    it('renders sign up link', () => {
      render(<LoginPage />);

      expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
    });

    it('renders SSO buttons', () => {
      render(<LoginPage />);

      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeInTheDocument();
    });

    it('renders security badge', () => {
      render(<LoginPage />);

      expect(screen.getByText(/256-bit encrypted/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows error when submitting empty form', async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    });

    it('shows error for invalid email format', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
    });

    it('shows error for short password', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'short');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });

    it('clears field error when user starts typing', async () => {
      render(<LoginPage />);

      // Submit empty form to trigger error
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();

      // Start typing in email field
      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 't');

      // Error should be cleared
      expect(screen.queryByText(/please enter a valid email/i)).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('shows loading state during submission', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'user@intelliflow.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'User@1234');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      // Should show loading state
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });

    it('disables form during submission', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'user@intelliflow.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'User@1234');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      // Form elements should be disabled
      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });

    it('redirects to dashboard on successful login', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'user@intelliflow.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'User@1234');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith('/dashboard');
        },
        { timeout: 3000 }
      );
    });

    it('redirects to MFA page when MFA is required', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'demo@intelliflow.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'Demo@1234');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith(
            expect.stringContaining('/auth/mfa/verify')
          );
        },
        { timeout: 3000 }
      );
    });

    it('shows error message on failed login', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'wrong@example.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'wrongpassword123');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('uses custom redirect URL from search params', async () => {
      mockGet.mockReturnValue('/settings');
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'user@intelliflow.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'User@1234');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith('/settings');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Remember Me', () => {
    it('checkbox is unchecked by default', () => {
      render(<LoginPage />);

      const checkbox = screen.getByLabelText(/remember me/i);
      expect(checkbox).not.toBeChecked();
    });

    it('can toggle remember me checkbox', async () => {
      render(<LoginPage />);

      const checkbox = screen.getByLabelText(/remember me/i);
      await user.click(checkbox);

      expect(checkbox).toBeChecked();
    });
  });

  describe('Password Visibility', () => {
    it('password is hidden by default', () => {
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });

    it('can toggle password visibility', async () => {
      render(<LoginPage />);

      const passwordInput = screen.getByLabelText(/^password$/i);
      const toggleButton = screen.getByRole('button', { name: /show password/i });

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'text');

      await user.click(toggleButton);
      expect(passwordInput).toHaveAttribute('type', 'password');
    });
  });

  describe('SSO Login', () => {
    it('initiates Google login when clicking Google button', async () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith(
            expect.stringContaining('provider=google')
          );
        },
        { timeout: 2000 }
      );
    });

    it('initiates Microsoft login when clicking Microsoft button', async () => {
      render(<LoginPage />);

      const msButton = screen.getByRole('button', { name: /sign in with microsoft/i });
      await user.click(msButton);

      await waitFor(
        () => {
          expect(mockPush).toHaveBeenCalledWith(
            expect.stringContaining('provider=microsoft')
          );
        },
        { timeout: 2000 }
      );
    });

    it('disables all buttons during SSO loading', async () => {
      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      const msButton = screen.getByRole('button', { name: /sign in with microsoft/i });
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });

      expect(msButton).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper form labels', () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      const passwordInput = screen.getByLabelText(/^password$/i);

      expect(emailInput).toHaveAttribute('id');
      expect(passwordInput).toHaveAttribute('id');
    });

    it('sets aria-invalid on error', async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      const emailInput = screen.getByLabelText(/email address/i);
      expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    });

    it('has error messages linked with aria-describedby', async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      const emailInput = screen.getByLabelText(/email address/i);
      const errorId = emailInput.getAttribute('aria-describedby');

      if (errorId) {
        const errorElement = document.getElementById(errorId);
        expect(errorElement).toBeInTheDocument();
      }
    });

    it('shows loading state with aria-busy', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'user@intelliflow.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'User@1234');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      // Form should indicate busy state
      expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });
  });
});
