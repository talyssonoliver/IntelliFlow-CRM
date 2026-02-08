/**
 * @vitest-environment jsdom
 */
/**
 * MFA Challenge Component - Supplementary Tests
 *
 * IMPLEMENTS: PG-015 (Sign In page), FLOW-001 (Login with MFA/SSO)
 *
 * Tests cover:
 * - Default rendering with TOTP
 * - Method switching (SMS, Email, Backup)
 * - Code input and auto-advance
 * - Paste handling
 * - Keyboard navigation (backspace, arrow keys)
 * - Auto-submit on complete code
 * - Verification success/failure
 * - Error display (prop error + local error)
 * - Resend functionality with cooldown
 * - Cancel button
 * - Loading/disabled states
 * - Backup code input
 * - InlineMfaChallenge variant
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaChallenge, InlineMfaChallenge, type MfaChallengeProps } from '../mfa-challenge';

// ============================================
// Test helpers
// ============================================

const defaultProps: MfaChallengeProps = {
  availableMethods: ['totp'],
  onVerify: vi.fn().mockResolvedValue(true),
};

// ============================================
// Tests
// ============================================

describe('MfaChallenge', () => {
  beforeEach(() => {
    (defaultProps.onVerify as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  });

  describe('Rendering', () => {
    it('renders the two-factor authentication title', () => {
      render(<MfaChallenge {...defaultProps} />);

      expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    });

    it('renders TOTP description by default', () => {
      render(<MfaChallenge {...defaultProps} />);

      expect(screen.getByText(/authenticator app/i)).toBeInTheDocument();
    });

    it('renders 6 digit inputs for TOTP', () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBe(6);
    });

    it('renders Verify button', () => {
      render(<MfaChallenge {...defaultProps} />);

      expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
    });

    it('does not render cancel button when onCancel is not provided', () => {
      render(<MfaChallenge {...defaultProps} />);

      expect(screen.queryByText(/different login method/i)).not.toBeInTheDocument();
    });

    it('renders cancel button when onCancel is provided', () => {
      const onCancel = vi.fn();
      render(<MfaChallenge {...defaultProps} onCancel={onCancel} />);

      expect(screen.getByText(/different login method/i)).toBeInTheDocument();
    });
  });

  describe('Method Switching', () => {
    it('does not show method selector with single method', () => {
      render(<MfaChallenge {...defaultProps} availableMethods={['totp']} />);

      expect(screen.queryByText('Text Message')).not.toBeInTheDocument();
    });

    it('shows method selector with multiple methods', () => {
      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['totp', 'sms', 'email', 'backup']}
        />
      );

      expect(screen.getByText('Authenticator App')).toBeInTheDocument();
      expect(screen.getByText('Text Message')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Backup Code')).toBeInTheDocument();
    });

    it('switches to SMS method on click', async () => {
      const user = userEvent.setup();

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['totp', 'sms']}
          maskedPhone="***-***-1234"
        />
      );

      await user.click(screen.getByText('Text Message'));

      expect(screen.getByText(/code sent to your phone/i)).toBeInTheDocument();
      expect(screen.getByText('***-***-1234')).toBeInTheDocument();
    });

    it('switches to Email method and shows masked email', async () => {
      const user = userEvent.setup();

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['totp', 'email']}
          maskedEmail="t***@example.com"
        />
      );

      await user.click(screen.getByText('Email'));

      expect(screen.getByText(/code sent to your email/i)).toBeInTheDocument();
      expect(screen.getByText('t***@example.com')).toBeInTheDocument();
    });

    it('switches to Backup Code method with text input', async () => {
      const user = userEvent.setup();

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['totp', 'backup']}
        />
      );

      await user.click(screen.getByText('Backup Code'));

      // Description should say "Enter one of your backup codes"
      expect(screen.getByText(/enter one of your backup codes/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/enter backup code/i)).toBeInTheDocument();
    });
  });

  describe('Code Input', () => {
    it('accepts digit input', async () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: '1' } });

      expect(inputs[0]).toHaveValue('1');
    });

    it('rejects non-digit input', async () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      fireEvent.change(inputs[0], { target: { value: 'a' } });

      expect(inputs[0]).toHaveValue('');
    });

    it('has correct aria-labels on digit inputs', () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      expect(inputs[0]).toHaveAttribute('aria-label', 'Digit 1 of 6');
      expect(inputs[5]).toHaveAttribute('aria-label', 'Digit 6 of 6');
    });
  });

  describe('Keyboard Navigation', () => {
    it('moves focus to previous input on backspace when empty', () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      // Set value in first, focus second
      fireEvent.change(inputs[0], { target: { value: '1' } });

      // Focus second input and press backspace on empty
      inputs[1].focus();
      fireEvent.keyDown(inputs[1], { key: 'Backspace' });

      expect(document.activeElement).toBe(inputs[0]);
    });

    it('moves focus left with ArrowLeft', () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      inputs[2].focus();
      fireEvent.keyDown(inputs[2], { key: 'ArrowLeft' });

      expect(document.activeElement).toBe(inputs[1]);
    });

    it('moves focus right with ArrowRight', () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');
      inputs[2].focus();
      fireEvent.keyDown(inputs[2], { key: 'ArrowRight' });

      expect(document.activeElement).toBe(inputs[3]);
    });
  });

  describe('Auto-submit', () => {
    it('auto-submits when all 6 digits are entered', async () => {
      const onVerify = vi.fn().mockResolvedValue(true);

      render(<MfaChallenge {...defaultProps} onVerify={onVerify} />);

      const inputs = screen.getAllByRole('textbox');

      // Fill first 5
      for (let i = 0; i < 5; i++) {
        fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
      }

      // Fill last digit triggers submit
      await act(async () => {
        fireEvent.change(inputs[5], { target: { value: '6' } });
      });

      await waitFor(() => {
        expect(onVerify).toHaveBeenCalledWith('123456', 'totp');
      });
    });
  });

  describe('Manual Submit', () => {
    it('shows error when submitting incomplete code', async () => {
      const user = userEvent.setup();

      render(<MfaChallenge {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: /verify/i }));

      expect(screen.getByText(/complete code/i)).toBeInTheDocument();
    });

    it('shows invalid code error when onVerify returns false', async () => {
      const onVerify = vi.fn().mockResolvedValue(false);

      render(<MfaChallenge {...defaultProps} onVerify={onVerify} />);

      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
      }

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/invalid code/i)).toBeInTheDocument();
      });
    });

    it('shows error message from thrown exception', async () => {
      const onVerify = vi.fn().mockRejectedValue(new Error('Server down'));

      render(<MfaChallenge {...defaultProps} onVerify={onVerify} />);

      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
      }

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));
      });

      await waitFor(() => {
        expect(screen.getByText('Server down')).toBeInTheDocument();
      });
    });

    it('shows generic error for non-Error exceptions', async () => {
      const onVerify = vi.fn().mockRejectedValue('something');

      render(<MfaChallenge {...defaultProps} onVerify={onVerify} />);

      const inputs = screen.getAllByRole('textbox');
      for (let i = 0; i < 6; i++) {
        fireEvent.change(inputs[i], { target: { value: String(i + 1) } });
      }

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /verify/i }));
      });

      await waitFor(() => {
        expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error Display', () => {
    it('displays external error prop', () => {
      render(
        <MfaChallenge {...defaultProps} error="Token expired" />
      );

      expect(screen.getByText('Token expired')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows verifying state when isLoading is true', () => {
      render(<MfaChallenge {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Verifying...')).toBeInTheDocument();
    });

    it('disables inputs when loading', () => {
      render(<MfaChallenge {...defaultProps} isLoading={true} />);

      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });
    });

    it('disables verify button when loading', () => {
      render(<MfaChallenge {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled();
    });
  });

  describe('Resend Code', () => {
    it('shows resend button for SMS method', async () => {
      const user = userEvent.setup();
      const onResend = vi.fn().mockResolvedValue(true);

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['sms']}
          defaultMethod="sms"
          onResend={onResend}
        />
      );

      expect(screen.getByText(/didn't receive a code/i)).toBeInTheDocument();
    });

    it('does not show resend for TOTP method', () => {
      render(
        <MfaChallenge {...defaultProps} onResend={vi.fn()} />
      );

      expect(screen.queryByText(/didn't receive a code/i)).not.toBeInTheDocument();
    });

    it('starts cooldown after successful resend', async () => {
      const user = userEvent.setup();
      const onResend = vi.fn().mockResolvedValue(true);

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['sms']}
          defaultMethod="sms"
          onResend={onResend}
        />
      );

      await user.click(screen.getByText(/didn't receive a code/i));

      await waitFor(() => {
        expect(screen.getByText(/resend code in/i)).toBeInTheDocument();
      });
    });

    it('handles resend error', async () => {
      const user = userEvent.setup();
      const onResend = vi.fn().mockRejectedValue(new Error('SMS service unavailable'));

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['sms']}
          defaultMethod="sms"
          onResend={onResend}
        />
      );

      await user.click(screen.getByText(/didn't receive a code/i));

      await waitFor(() => {
        expect(screen.getByText('SMS service unavailable')).toBeInTheDocument();
      });
    });
  });

  describe('Cancel Button', () => {
    it('calls onCancel when cancel button clicked', async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();

      render(<MfaChallenge {...defaultProps} onCancel={onCancel} />);

      await user.click(screen.getByText(/different login method/i));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Backup Code Method', () => {
    it('renders single text input for backup code', async () => {
      const user = userEvent.setup();

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['totp', 'backup']}
        />
      );

      await user.click(screen.getByText('Backup Code'));

      const input = screen.getByPlaceholderText(/enter backup code/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('maxLength', '8');
    });

    it('converts backup code to uppercase', async () => {
      const user = userEvent.setup();

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['backup']}
          defaultMethod="backup"
        />
      );

      const input = screen.getByPlaceholderText(/enter backup code/i);
      await user.type(input, 'abcd1234');

      expect(input).toHaveValue('ABCD1234');
    });

    it('shows error when submitting short backup code', async () => {
      const user = userEvent.setup();

      render(
        <MfaChallenge
          {...defaultProps}
          availableMethods={['backup']}
          defaultMethod="backup"
        />
      );

      const input = screen.getByPlaceholderText(/enter backup code/i);
      await user.type(input, 'ABC');

      await user.click(screen.getByRole('button', { name: /verify/i }));

      expect(screen.getByText(/complete code/i)).toBeInTheDocument();
    });
  });

  describe('Paste Handling', () => {
    it('fills all inputs on paste', () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');

      const pasteEvent = {
        preventDefault: vi.fn(),
        clipboardData: {
          getData: () => '123456',
        },
      };

      fireEvent.paste(inputs[0], pasteEvent);

      expect(inputs[0]).toHaveValue('1');
      expect(inputs[1]).toHaveValue('2');
      expect(inputs[2]).toHaveValue('3');
      expect(inputs[3]).toHaveValue('4');
      expect(inputs[4]).toHaveValue('5');
      expect(inputs[5]).toHaveValue('6');
    });

    it('strips non-digit characters from pasted text', () => {
      render(<MfaChallenge {...defaultProps} />);

      const inputs = screen.getAllByRole('textbox');

      const pasteEvent = {
        preventDefault: vi.fn(),
        clipboardData: {
          getData: () => '12-34-56',
        },
      };

      fireEvent.paste(inputs[0], pasteEvent);

      expect(inputs[0]).toHaveValue('1');
      expect(inputs[1]).toHaveValue('2');
      expect(inputs[2]).toHaveValue('3');
    });
  });
});

describe('InlineMfaChallenge', () => {
  it('renders back to login button', () => {
    const onBack = vi.fn();

    render(
      <InlineMfaChallenge
        availableMethods={['totp']}
        onVerify={vi.fn().mockResolvedValue(true)}
        onBack={onBack}
      />
    );

    expect(screen.getByText('Back to login')).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(
      <InlineMfaChallenge
        availableMethods={['totp']}
        onVerify={vi.fn().mockResolvedValue(true)}
        onBack={onBack}
      />
    );

    await user.click(screen.getByText('Back to login'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the inner MfaChallenge component', () => {
    render(
      <InlineMfaChallenge
        availableMethods={['totp']}
        onVerify={vi.fn().mockResolvedValue(true)}
        onBack={vi.fn()}
      />
    );

    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
  });
});
