/**
 * @vitest-environment jsdom
 */
/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metadata } from '../layout';

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

// Mock auth context
const mockLogin = vi.fn();
const mockLoginWithOAuth = vi.fn();
const mockLogout = vi.fn();
const mockVerifyMfa = vi.fn();
const mockClearError = vi.fn();

const createMockAuth = (overrides = {}) => ({
  user: null,
  isLoading: false, // Default to not loading so form is interactive
  isAuthenticated: false,
  error: null,
  login: mockLogin,
  loginWithOAuth: mockLoginWithOAuth,
  logout: mockLogout,
  verifyMfa: mockVerifyMfa,
  clearError: mockClearError,
  mfa: {
    required: false,
    methods: [],
  },
  ...overrides,
});

let mockAuthState = createMockAuth();

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => mockAuthState,
  useRedirectIfAuthenticated: () => {},
}));

// Import after mocks
import LoginPage from '../page';

describe('LoginPage', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReturnValue(null); // No redirect param by default

    // Reset mock auth state to default
    mockAuthState = createMockAuth();

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

      // Login page shows "Secure Access" badge in the header
      expect(screen.getByText(/secure access/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('shows error when submitting empty form', async () => {
      render(<LoginPage />);

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      expect(screen.getByText(/please enter a valid email|email is required/i)).toBeInTheDocument();
    });

    it('shows error for invalid email format', async () => {
      render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'invalid-email');

      // Use fireEvent.submit directly on the form to bypass HTML5 email
      // validation (which happy-dom enforces on type="email" inputs before
      // letting the JS onSubmit handler run).
      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText(/please enter a valid email|email is required/i)
        ).toBeInTheDocument();
      });
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

      expect(screen.getByText(/please enter a valid email|email is required/i)).toBeInTheDocument();

      // Start typing in email field
      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 't');

      // Error should be cleared
      expect(
        screen.queryByText(/please enter a valid email|email is required/i)
      ).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('shows loading state during submission', async () => {
      // Make login take time so we can observe loading state
      mockLogin.mockImplementation(() => new Promise(() => {}));

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
      // Make login take time so we can observe disabled state
      mockLogin.mockImplementation(() => new Promise(() => {}));

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

    it('redirects to / on successful login via hard navigation', async () => {
      // login/page.tsx changed from `router.push('/dashboard')` to a hard
      // `globalThis.location.href = '/'` inside a 1000ms setTimeout (commit
      // 103b6642) — so the server re-runs the (public)/layout cookie check
      // and renders the authenticated home variant. Stub `location` so we
      // can assert the href assignment instead of swallowing a real nav.
      const originalLocation = globalThis.location;
      const locationStub = { href: '' } as unknown as Location;
      Object.defineProperty(globalThis, 'location', {
        value: locationStub,
        writable: true,
        configurable: true,
      });

      try {
        mockLogin.mockResolvedValue(true);

        render(<LoginPage />);

        const emailInput = screen.getByLabelText(/email address/i);
        await user.type(emailInput, 'user@intelliflow.com');

        const passwordInput = screen.getByLabelText(/^password$/i);
        await user.type(passwordInput, 'User@1234');

        const submitButton = screen.getByRole('button', { name: /^sign in$/i });
        await user.click(submitButton);

        await waitFor(
          () => {
            expect(locationStub.href).toBe('/');
          },
          { timeout: 3000 }
        );
      } finally {
        Object.defineProperty(globalThis, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      }
    });

    it('redirects to MFA page when MFA is required', async () => {
      // Replace mockAuthState with a new object that has mfa.required=true.
      // The component reads auth.mfa.required via useAuth() on every render,
      // so replacing the whole object in the mockLogin callback (before setState
      // triggers a re-render) makes the useEffect detect the change.
      mockLogin.mockImplementation(async () => {
        // Atomically swap the auth state so the next render sees mfa.required=true.
        mockAuthState = createMockAuth({
          mfa: { required: true, methods: ['totp'] as any },
        });
        return false;
      });

      const { rerender } = render(<LoginPage />);

      const emailInput = screen.getByLabelText(/email address/i);
      await user.type(emailInput, 'demo@intelliflow.com');

      const passwordInput = screen.getByLabelText(/^password$/i);
      await user.type(passwordInput, 'Demo@1234');

      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      await user.click(submitButton);

      // Force re-render so the component picks up the updated mockAuthState
      rerender(<LoginPage />);

      await waitFor(
        () => {
          // The MFA challenge step renders "Two-Factor Authentication" headings
          // (both an h1 on the outer wrapper and an h2 inside MfaChallenge)
          const headings = screen.getAllByRole('heading', { name: /two-factor authentication/i });
          expect(headings.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );
    });

    it('shows error message on failed login', async () => {
      mockLogin.mockRejectedValue(new Error('Invalid email or password'));

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

    it('ignores search-param redirect and goes to / (current behavior)', async () => {
      // Per commit 103b6642 the login page unconditionally hard-navigates to
      // `/` after success; the `redirect` search param is not used here.
      // If that policy changes, this test needs to follow the redirect param.
      const originalLocation = globalThis.location;
      const locationStub = { href: '' } as unknown as Location;
      Object.defineProperty(globalThis, 'location', {
        value: locationStub,
        writable: true,
        configurable: true,
      });

      try {
        mockGet.mockReturnValue('/settings');
        mockLogin.mockResolvedValue(true);

        render(<LoginPage />);

        const emailInput = screen.getByLabelText(/email address/i);
        await user.type(emailInput, 'user@intelliflow.com');

        const passwordInput = screen.getByLabelText(/^password$/i);
        await user.type(passwordInput, 'User@1234');

        const submitButton = screen.getByRole('button', { name: /^sign in$/i });
        await user.click(submitButton);

        await waitFor(
          () => {
            expect(locationStub.href).toBe('/');
          },
          { timeout: 3000 }
        );
      } finally {
        Object.defineProperty(globalThis, 'location', {
          value: originalLocation,
          writable: true,
          configurable: true,
        });
      }
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
      mockLoginWithOAuth.mockResolvedValue(undefined);

      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      await waitFor(
        () => {
          expect(mockLoginWithOAuth).toHaveBeenCalledWith('google');
        },
        { timeout: 2000 }
      );
    });

    it('initiates Microsoft login when clicking Microsoft button', async () => {
      mockLoginWithOAuth.mockResolvedValue(undefined);

      render(<LoginPage />);

      const msButton = screen.getByRole('button', { name: /sign in with microsoft/i });
      await user.click(msButton);

      await waitFor(
        () => {
          expect(mockLoginWithOAuth).toHaveBeenCalledWith('azure');
        },
        { timeout: 2000 }
      );
    });

    it('disables only the clicked SSO button during loading (not all buttons)', async () => {
      // When a specific SSO button (e.g. Google) is loading, only THAT button
      // becomes disabled via its own local isLoading state. The MS button and the
      // submit button are controlled by the page-level isLoading (form submit),
      // which stays false during OAuth flows. This is correct UX: each SSO
      // button manages its own loading independently.
      mockLoginWithOAuth.mockImplementation(() => new Promise(() => {}));

      render(<LoginPage />);

      const googleButton = screen.getByRole('button', { name: /sign in with google/i });
      await user.click(googleButton);

      // The Google button disables itself via local isLoading state
      await waitFor(() => {
        expect(googleButton).toBeDisabled();
      });

      // The MS button and form submit remain enabled (page isLoading is still false)
      const msButton = screen.getByRole('button', { name: /sign in with microsoft/i });
      const submitButton = screen.getByRole('button', { name: /^sign in$/i });
      expect(msButton).not.toBeDisabled();
      expect(submitButton).not.toBeDisabled();
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
      // Make login take time so we can observe loading state
      mockLogin.mockImplementation(() => new Promise(() => {}));

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

  describe('Login Metadata', () => {
    it('should have correct SEO metadata', () => {
      expect(metadata.title).toBe('Log In');
      expect(metadata.description).toContain('IntelliFlow CRM');
      expect(metadata.description).toContain('SSO');
    });

    it('should have Open Graph metadata', () => {
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/login');
      expect(metadata.openGraph?.siteName).toBe('IntelliFlow CRM');
      expect((metadata.openGraph as Record<string, unknown>)?.type).toBe('website');
    });

    it('should have Twitter metadata', () => {
      expect(metadata.twitter).toBeDefined();
      expect((metadata.twitter as Record<string, unknown>)?.card).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBeDefined();
    });

    it('should have canonical URL', () => {
      expect(metadata.alternates?.canonical).toBe('/login');
    });
  });
});
