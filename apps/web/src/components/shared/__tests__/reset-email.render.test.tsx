/**
 * @vitest-environment happy-dom
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

import {
  ForgotPasswordForm,
  ResetEmailSent,
  EmailInput,
  buildResetEmailPayload,
} from '../reset-email';

// ============================================
// ForgotPasswordForm Tests
// ============================================

describe('ForgotPasswordForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email input with mail icon', () => {
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} />);
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByText('mail')).toBeTruthy();
  });

  it('renders submit button with "Send reset link" text', () => {
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} />);
    expect(screen.getByText('Send reset link')).toBeTruthy();
  });

  it('shows validation error on empty form submission', async () => {
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /send reset link/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Email address is required')).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows validation error on invalid email format', async () => {
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} />);

    const emailInput = screen.getByLabelText('Email address');
    await user.type(emailInput, 'not-an-email');
    await user.tab(); // blur

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address')).toBeTruthy();
    });
  });

  it('calls onSubmit with trimmed lowercase email on valid submission', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ForgotPasswordForm onSubmit={onSubmit} />);

    const emailInput = screen.getByLabelText('Email address');
    await user.type(emailInput, '  Test@Example.COM  ');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('disables form when isLoading is true', () => {
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} isLoading={true} />);

    const emailInput = screen.getByLabelText('Email address');
    expect(emailInput.hasAttribute('disabled')).toBe(true);

    const submitBtn = screen.getByRole('button');
    expect(submitBtn.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Sending reset link...')).toBeTruthy();
  });

  it('pre-fills email from initialEmail prop', () => {
    const onSubmit = vi.fn();
    render(<ForgotPasswordForm onSubmit={onSubmit} initialEmail="prefilled@test.com" />);

    const emailInput = screen.getByLabelText('Email address') as HTMLInputElement;
    expect(emailInput.value).toBe('prefilled@test.com');
  });
});

// ============================================
// ResetEmailSent Tests
// ============================================

describe('ResetEmailSent', () => {
  const defaultProps = {
    email: 'test@example.com',
    onResend: vi.fn().mockResolvedValue(undefined),
    onChangeEmail: vi.fn(),
    isResending: false,
    resendCooldown: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders success icon', () => {
    render(<ResetEmailSent {...defaultProps} />);
    expect(screen.getByText('mark_email_read')).toBeTruthy();
  });

  it('shows masked email', () => {
    render(<ResetEmailSent {...defaultProps} email="test@example.com" />);
    // email.replace(/(.{2})(.*)(@.*)/, '$1***$3') => te***@example.com
    expect(screen.getByText('te***@example.com')).toBeTruthy();
  });

  it('shows "Check your email" heading', () => {
    render(<ResetEmailSent {...defaultProps} />);
    expect(screen.getByText('Check your email')).toBeTruthy();
  });

  it('shows resend button when cooldown is 0', () => {
    render(<ResetEmailSent {...defaultProps} resendCooldown={0} />);
    const resendBtn = screen.getByText('Resend email');
    expect(resendBtn).toBeTruthy();
    expect(resendBtn.closest('button')?.hasAttribute('disabled')).toBe(false);
  });

  it('shows cooldown timer when resendCooldown > 0', () => {
    render(<ResetEmailSent {...defaultProps} resendCooldown={45} />);
    expect(screen.getByText(/Resend in 45s/)).toBeTruthy();
  });

  it('disables resend button during cooldown', () => {
    render(<ResetEmailSent {...defaultProps} resendCooldown={30} />);
    const btn = screen.getByText(/Resend in/).closest('button');
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });

  it('calls onResend when resend button clicked with cooldown=0', async () => {
    const onResend = vi.fn().mockResolvedValue(undefined);
    render(<ResetEmailSent {...defaultProps} onResend={onResend} resendCooldown={0} />);

    await act(async () => {
      screen.getByText('Resend email').closest('button')!.click();
    });

    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it('disables resend during isResending', () => {
    render(<ResetEmailSent {...defaultProps} isResending={true} />);
    expect(screen.getByText('Resending...')).toBeTruthy();
    const btn = screen.getByText('Resending...').closest('button');
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });

  it('"Use a different email address" calls onChangeEmail', async () => {
    const onChangeEmail = vi.fn();
    render(<ResetEmailSent {...defaultProps} onChangeEmail={onChangeEmail} />);

    await act(async () => {
      screen.getByText('Use a different email address').click();
    });

    expect(onChangeEmail).toHaveBeenCalledTimes(1);
  });

  it('shows "link will expire in 1 hour" info', () => {
    render(<ResetEmailSent {...defaultProps} />);
    expect(screen.getByText('1 hour')).toBeTruthy();
    expect(screen.getByText(/The link will expire in/)).toBeTruthy();
  });

  it('counts down cooldown timer over time', async () => {
    render(<ResetEmailSent {...defaultProps} resendCooldown={3} />);

    expect(screen.getByText(/Resend in 3s/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Resend in 2s/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/Resend in 1s/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Resend email')).toBeTruthy();
  });
});

// ============================================
// EmailInput Tests
// ============================================

describe('EmailInput', () => {
  const user = userEvent.setup();

  it('renders with ARIA attributes when error is present', () => {
    render(<EmailInput value="" onChange={vi.fn()} error="Invalid email" />);
    const input = screen.getByLabelText('Email address');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('reset-email-error');
  });

  it('does not set aria-invalid when no error', () => {
    render(<EmailInput value="" onChange={vi.fn()} />);
    const input = screen.getByLabelText('Email address');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows error message when error prop provided', () => {
    render(<EmailInput value="" onChange={vi.fn()} error="Please enter a valid email address" />);
    expect(screen.getByText('Please enter a valid email address')).toBeTruthy();
  });

  it('calls onChange on input', async () => {
    const onChange = vi.fn();
    render(<EmailInput value="" onChange={onChange} />);

    const input = screen.getByLabelText('Email address');
    await user.type(input, 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('calls onBlur on blur', async () => {
    const onBlur = vi.fn();
    render(<EmailInput value="" onChange={vi.fn()} onBlur={onBlur} />);

    const input = screen.getByLabelText('Email address');
    await user.click(input);
    await user.tab();

    expect(onBlur).toHaveBeenCalled();
  });

  it('disabled state prevents input', () => {
    render(<EmailInput value="" onChange={vi.fn()} disabled={true} />);
    const input = screen.getByLabelText('Email address');
    expect(input.hasAttribute('disabled')).toBe(true);
  });
});

// ============================================
// buildResetEmailPayload Tests
// ============================================

describe('buildResetEmailPayload', () => {
  it('returns valid email payload with required fields', () => {
    const payload = buildResetEmailPayload({
      email: 'user@example.com',
      resetUrl: 'http://localhost/reset-password/token123',
      expiresAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect(payload.to).toBe('user@example.com');
    expect(payload.from).toBe('noreply@intelliflow.com');
    expect(payload.replyTo).toBe('support@intelliflow.com');
    expect(payload.subject).toBe('Reset your IntelliFlow password');
    expect(payload.htmlBody).toContain('Reset Your Password');
    expect(payload.textBody).toContain('Reset Your Password');
    expect(payload.metadata.source).toBe('password_reset');
    expect(payload.metadata.email).toBe('user@example.com');
  });

  it('HTML body escapes XSS characters in userName', () => {
    const payload = buildResetEmailPayload({
      email: 'user@example.com',
      resetUrl: 'http://localhost/reset-password/token123',
      expiresAt: new Date('2026-01-01T00:00:00Z'),
      userName: '<script>alert("xss")</script>',
    });

    expect(payload.htmlBody).not.toContain('<script>');
    expect(payload.htmlBody).toContain('&lt;script&gt;');
  });
});
