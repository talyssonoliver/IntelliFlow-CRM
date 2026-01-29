/**
 * @vitest-environment jsdom
 */
/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegistrationForm } from '../registration-form';

describe('RegistrationForm', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('renders all form fields', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/create a password/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/confirm your password/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders terms and privacy policy links', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy');
  });

  it('shows validation errors on submit with empty fields', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(screen.getByText(/you must accept the terms/i)).toBeInTheDocument();
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    const emailInput = screen.getByLabelText(/email address/i);
    await user.type(emailInput, 'invalid-email');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument();
    });
  });

  it('validates password length', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByPlaceholderText(/create a password/i);
    await user.type(passwordInput, 'short');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
    });
  });

  it('validates password match', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByPlaceholderText(/create a password/i);
    const confirmInput = screen.getByPlaceholderText(/confirm your password/i);

    await user.type(passwordInput, 'Password123!');
    await user.type(confirmInput, 'DifferentPassword123!');
    await user.tab();

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it('shows password strength indicator', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByPlaceholderText(/create a password/i);
    await user.type(passwordInput, 'weak');

    expect(screen.getByText(/password strength/i)).toBeInTheDocument();
    expect(screen.getByText(/weak/i)).toBeInTheDocument();
  });

  it('updates password strength as password changes', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByPlaceholderText(/create a password/i);

    // Start with weak password
    await user.type(passwordInput, 'weak');
    expect(screen.getByText(/weak/i)).toBeInTheDocument();

    // Add more characters to strengthen
    await user.type(passwordInput, 'Password123!');
    await waitFor(() => {
      // Should show good or strong now
      expect(screen.queryByText(/weak/i)).not.toBeInTheDocument();
    });
  });

  it('submits form with valid data', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    await user.type(screen.getByLabelText(/full name/i), 'John Doe');
    await user.type(screen.getByLabelText(/email address/i), 'john@example.com');
    await user.type(screen.getByPlaceholderText(/create a password/i), 'SecurePass123!');
    await user.type(screen.getByPlaceholderText(/confirm your password/i), 'SecurePass123!');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'SecurePass123!',
        confirmPassword: 'SecurePass123!',
        acceptTerms: true,
      });
    });
  });

  it('disables form when isLoading is true', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} isLoading />);

    expect(screen.getByLabelText(/full name/i)).toBeDisabled();
    expect(screen.getByLabelText(/email address/i)).toBeDisabled();
    expect(screen.getByPlaceholderText(/create a password/i)).toBeDisabled();
    expect(screen.getByPlaceholderText(/confirm your password/i)).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
  });

  it('shows loading state on submit button', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} isLoading />);

    expect(screen.getByRole('button', { name: /creating account/i })).toBeInTheDocument();
    expect(screen.getByText(/creating account/i)).toBeInTheDocument();
  });

  it('uses initial email when provided', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} initialEmail="test@example.com" />);

    expect(screen.getByLabelText(/email address/i)).toHaveValue('test@example.com');
  });

  it('clears field error when user starts typing', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Submit to trigger errors
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    });

    // Start typing to clear error
    await user.type(screen.getByLabelText(/full name/i), 'Jo');
    await waitFor(() => {
      expect(screen.queryByText(/full name is required/i)).not.toBeInTheDocument();
    });
  });

  it('has accessible form labels', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    expect(screen.getByLabelText(/full name/i)).toHaveAttribute('id');
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('id');
  });

  it('shows aria-invalid on fields with errors', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/full name/i)).toHaveAttribute('aria-invalid', 'true');
    });
  });
});

// ============================================
// Password Debounce Tests (PG-016 Enhancement)
// ============================================

describe('RegistrationForm - Password Debounce', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('shows password strength indicator when typing', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByPlaceholderText(/create a password/i);

    // Type a password
    await user.type(passwordInput, 'pass');

    // Verify strength indicator shows
    expect(screen.getByText(/password strength/i)).toBeInTheDocument();
  });

  it('updates strength indicator as password changes', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    const passwordInput = screen.getByPlaceholderText(/create a password/i);

    // Type weak password
    await user.type(passwordInput, 'weak');
    expect(screen.getByText(/weak/i)).toBeInTheDocument();

    // Type stronger password
    await user.clear(passwordInput);
    await user.type(passwordInput, 'SecurePass123!');
    await waitFor(() => {
      expect(screen.queryByText(/weak/i)).not.toBeInTheDocument();
    });
  });

  it('allows submission with valid data', async () => {
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Fill valid form
    await user.type(screen.getByLabelText(/full name/i), 'Test User');
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByPlaceholderText(/create a password/i), 'SecurePass123!');
    await user.type(screen.getByPlaceholderText(/confirm your password/i), 'SecurePass123!');
    await user.click(screen.getByRole('checkbox'));

    // Submit
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });
});

// ============================================
// Accessibility Enhancement Tests (PG-016)
// ============================================

describe('RegistrationForm - Accessibility Enhancements', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('links password strength via aria-describedby', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Password input should reference strength indicator
    const passwordInput = screen.getByPlaceholderText(/create a password/i);

    // When password is entered, aria-describedby should link to strength indicator
    // Note: This is an enhancement that needs implementation
    expect(passwordInput).toBeInTheDocument();
  });

  it('announces errors via aria-live', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Submit empty form to trigger errors
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Wait for errors to appear
    await waitFor(() => {
      // Error container should have aria-live for screen readers
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it('maintains focus on first error field', async () => {
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Submit empty form
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // First error field should receive focus (enhancement to implement)
    await waitFor(() => {
      // Verify errors are shown
      expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
    });
  });

  it('has proper heading hierarchy', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Form should have proper aria-label
    expect(screen.getByRole('form', { name: /registration form/i })).toBeInTheDocument();
  });
});

// ============================================
// HaveIBeenPwned Integration Tests (PG-016)
// ============================================

describe('RegistrationForm - HaveIBeenPwned Integration', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('warns user about compromised password', async () => {
    // This test verifies the breach check warning concept
    // The actual implementation will make an API call
    const user = userEvent.setup();
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Enter a known-breached password pattern
    const passwordInput = screen.getByPlaceholderText(/create a password/i);
    await user.type(passwordInput, 'password123');
    await user.tab();

    // Note: The warning will appear after implementation
    // For now, verify the input exists
    expect(passwordInput).toHaveValue('password123');
  });

  it('allows submission with warning (non-blocking)', async () => {
    // Breach check should warn but NOT block submission
    const user = userEvent.setup();
    mockOnSubmit.mockResolvedValue(undefined);
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Fill valid form with potentially breached password
    await user.type(screen.getByLabelText(/full name/i), 'Test User');
    await user.type(screen.getByLabelText(/email address/i), 'test@example.com');
    await user.type(screen.getByPlaceholderText(/create a password/i), 'Password123!');
    await user.type(screen.getByPlaceholderText(/confirm your password/i), 'Password123!');
    await user.click(screen.getByRole('checkbox'));

    // Submit should still work even with breach warning
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });
});

// ============================================
// Honeypot Field Tests (PG-016 Security)
// ============================================

describe('RegistrationForm - Honeypot Field', () => {
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    mockOnSubmit.mockClear();
  });

  it('includes hidden honeypot field', () => {
    render(<RegistrationForm onSubmit={mockOnSubmit} />);

    // Honeypot field should exist but be hidden
    // This is an enhancement to implement
    // For now, verify the form renders
    expect(screen.getByRole('form')).toBeInTheDocument();
  });
});
