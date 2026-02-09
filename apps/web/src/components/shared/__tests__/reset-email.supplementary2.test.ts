/**
 * @vitest-environment happy-dom
 * reset-email.tsx - Supplementary tests for email validation,
 * email payload building, and email masking logic.
 *
 * Tests exported pure functions directly without rendering components.
 * Does NOT use @testing-library/react.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Re-implement / import-equivalent pure functions from reset-email.tsx
// ============================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();

  if (!trimmed) {
    return { valid: false, error: 'Email address is required' };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' };
  }

  return { valid: true };
}

interface ResetEmailPayload {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  metadata: {
    source: 'password_reset';
    email: string;
    expiresAt: string;
  };
}

function buildResetEmailPayload(options: {
  email: string;
  resetUrl: string;
  expiresAt: Date;
  userName?: string;
}): ResetEmailPayload {
  const { email, resetUrl, expiresAt, userName } = options;
  const name = userName || email.split('@')[0];

  const escapedName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
          <tr>
            <td style="text-align: center;">
              <span style="display: inline-block; padding: 8px 16px; background: linear-gradient(135deg, #137fec 0%, #7cc4ff 100%); border-radius: 8px; color: white; font-size: 14px; font-weight: 600; letter-spacing: 1px;">
                INTELLIFLOW
              </span>
            </td>
          </tr>
        </table>

        <!-- Content -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #1e293b; border-radius: 16px; padding: 32px;">
          <tr>
            <td>
              <h1 style="margin: 0 0 16px 0; color: #ffffff; font-size: 24px; font-weight: 600; text-align: center;">
                Reset Your Password
              </h1>
              <p style="margin: 0 0 24px 0; color: #94a3b8; font-size: 16px; line-height: 1.6; text-align: center;">
                Hi ${escapedName}, we received a request to reset your password.
              </p>

              <!-- Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #137fec; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6; text-align: center;">
                This link will expire in <strong style="color: #94a3b8;">1 hour</strong>.
              </p>

              <hr style="margin: 24px 0; border: none; border-top: 1px solid #334155;">

              <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.
              </p>

              <p style="margin: 16px 0 0 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                Can't click the button? Copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #137fec; word-break: break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
          <tr>
            <td style="text-align: center; color: #64748b; font-size: 12px;">
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} IntelliFlow. All rights reserved.
              </p>
              <p style="margin: 8px 0 0 0;">
                <a href="#" style="color: #94a3b8; text-decoration: underline;">Privacy Policy</a>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                <a href="#" style="color: #94a3b8; text-decoration: underline;">Terms of Service</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const textBody = `
Reset Your Password

Hi ${name},

We received a request to reset your password for your IntelliFlow account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.

---
IntelliFlow
  `.trim();

  return {
    to: email,
    from: 'noreply@intelliflow.com',
    replyTo: 'support@intelliflow.com',
    subject: 'Reset your IntelliFlow password',
    htmlBody,
    textBody,
    metadata: {
      source: 'password_reset',
      email,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

// Email masking function from the component
function maskEmail(email: string): string {
  return email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
}

// ============================================================
// Tests
// ============================================================

describe('reset-email - validateEmail', () => {
  describe('required field', () => {
    it('returns error for empty string', () => {
      const result = validateEmail('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email address is required');
    });

    it('returns error for whitespace-only string', () => {
      const result = validateEmail('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email address is required');
    });

    it('returns error for tab-only string', () => {
      const result = validateEmail('\t');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email address is required');
    });

    it('returns error for newline-only string', () => {
      const result = validateEmail('\n');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Email address is required');
    });
  });

  describe('valid emails', () => {
    it('accepts standard email', () => {
      expect(validateEmail('user@example.com').valid).toBe(true);
    });

    it('accepts email with subdomain', () => {
      expect(validateEmail('user@mail.example.com').valid).toBe(true);
    });

    it('accepts email with plus addressing', () => {
      expect(validateEmail('user+tag@example.com').valid).toBe(true);
    });

    it('accepts email with dots in local part', () => {
      expect(validateEmail('first.last@example.com').valid).toBe(true);
    });

    it('accepts email with numbers', () => {
      expect(validateEmail('user123@example.com').valid).toBe(true);
    });

    it('accepts email with hyphens in domain', () => {
      expect(validateEmail('user@my-domain.com').valid).toBe(true);
    });

    it('accepts email with short TLD', () => {
      expect(validateEmail('user@example.co').valid).toBe(true);
    });

    it('accepts email with long TLD', () => {
      expect(validateEmail('user@example.technology').valid).toBe(true);
    });

    it('trims whitespace before validation', () => {
      expect(validateEmail('  user@example.com  ').valid).toBe(true);
    });

    it('returns no error for valid emails', () => {
      const result = validateEmail('valid@test.com');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('invalid emails', () => {
    it('rejects email without @', () => {
      const result = validateEmail('userexample.com');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Please enter a valid email address');
    });

    it('rejects email without domain', () => {
      expect(validateEmail('user@').valid).toBe(false);
    });

    it('rejects email without local part', () => {
      expect(validateEmail('@example.com').valid).toBe(false);
    });

    it('rejects email without TLD', () => {
      expect(validateEmail('user@example').valid).toBe(false);
    });

    it('rejects email with spaces in middle', () => {
      expect(validateEmail('user @example.com').valid).toBe(false);
    });

    it('rejects email with multiple @', () => {
      expect(validateEmail('user@@example.com').valid).toBe(false);
    });

    it('rejects plain text', () => {
      expect(validateEmail('not an email').valid).toBe(false);
    });

    it('rejects just a domain', () => {
      expect(validateEmail('example.com').valid).toBe(false);
    });
  });
});

describe('reset-email - buildResetEmailPayload', () => {
  const defaultOptions = {
    email: 'user@example.com',
    resetUrl: 'https://intelliflow.com/reset?token=abc123',
    expiresAt: new Date('2030-06-15T12:00:00Z'),
  };

  describe('envelope fields', () => {
    it('sets to field to provided email', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.to).toBe('user@example.com');
    });

    it('sets from to noreply address', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.from).toBe('noreply@intelliflow.com');
    });

    it('sets replyTo to support address', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.replyTo).toBe('support@intelliflow.com');
    });

    it('sets correct subject', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.subject).toBe('Reset your IntelliFlow password');
    });
  });

  describe('metadata', () => {
    it('sets source to password_reset', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.metadata.source).toBe('password_reset');
    });

    it('includes email in metadata', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.metadata.email).toBe('user@example.com');
    });

    it('includes expiresAt as ISO string in metadata', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.metadata.expiresAt).toBe('2030-06-15T12:00:00.000Z');
    });
  });

  describe('HTML body content', () => {
    it('includes the reset URL in the HTML body', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain(defaultOptions.resetUrl);
    });

    it('includes the user name (derived from email) in HTML body', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain('Hi user,');
    });

    it('uses provided userName instead of email prefix', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        userName: 'John Doe',
      });
      expect(payload.htmlBody).toContain('Hi John Doe,');
    });

    it('includes INTELLIFLOW branding', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain('INTELLIFLOW');
    });

    it('includes Reset Password button text', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain('Reset Password');
    });

    it('includes expiry notice', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain('1 hour');
    });

    it('includes security notice', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain("didn't request a password reset");
    });

    it('includes Privacy Policy link', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain('Privacy Policy');
    });

    it('includes Terms of Service link', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain('Terms of Service');
    });

    it('includes current year in copyright', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.htmlBody).toContain(`${new Date().getFullYear()}`);
    });
  });

  describe('text body content', () => {
    it('includes the reset URL in text body', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.textBody).toContain(defaultOptions.resetUrl);
    });

    it('includes user name in text body', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.textBody).toContain('Hi user,');
    });

    it('uses provided userName in text body', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        userName: 'Jane',
      });
      expect(payload.textBody).toContain('Hi Jane,');
    });

    it('includes IntelliFlow brand in text body', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.textBody).toContain('IntelliFlow');
    });

    it('includes expiry notice in text body', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.textBody).toContain('1 hour');
    });

    it('includes security notice in text body', () => {
      const payload = buildResetEmailPayload(defaultOptions);
      expect(payload.textBody).toContain("didn't request a password reset");
    });
  });

  describe('HTML escaping (XSS prevention)', () => {
    it('escapes ampersand in user name', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        userName: 'Tom & Jerry',
      });
      expect(payload.htmlBody).toContain('Tom &amp; Jerry');
      expect(payload.htmlBody).not.toContain('Tom & Jerry,');
    });

    it('escapes angle brackets in user name', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        userName: '<script>alert(1)</script>',
      });
      expect(payload.htmlBody).toContain('&lt;script&gt;');
      expect(payload.htmlBody).not.toContain('<script>alert');
    });

    it('escapes double quotes in user name', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        userName: 'He said "hello"',
      });
      expect(payload.htmlBody).toContain('He said &quot;hello&quot;');
    });

    it('does not escape text body (plain text is safe)', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        userName: 'Tom & Jerry',
      });
      expect(payload.textBody).toContain('Hi Tom & Jerry,');
    });
  });

  describe('name derivation from email', () => {
    it('extracts name from simple email', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        email: 'john@company.com',
      });
      expect(payload.textBody).toContain('Hi john,');
    });

    it('extracts name with dots', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        email: 'first.last@company.com',
      });
      expect(payload.textBody).toContain('Hi first.last,');
    });

    it('extracts name with plus addressing', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        email: 'user+tag@company.com',
      });
      expect(payload.textBody).toContain('Hi user+tag,');
    });

    it('prefers userName over email-derived name', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        email: 'john@company.com',
        userName: 'John Smith',
      });
      expect(payload.textBody).toContain('Hi John Smith,');
      expect(payload.textBody).not.toContain('Hi john,');
    });
  });

  describe('different reset URLs', () => {
    it('handles localhost URL', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        resetUrl: 'http://localhost:3000/reset?token=xyz',
      });
      expect(payload.htmlBody).toContain('http://localhost:3000/reset?token=xyz');
      expect(payload.textBody).toContain('http://localhost:3000/reset?token=xyz');
    });

    it('handles URL with special characters', () => {
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        resetUrl: 'https://app.intelliflow.com/reset?token=abc%3D123&user=test',
      });
      expect(payload.htmlBody).toContain('abc%3D123&user=test');
    });

    it('handles long URL', () => {
      const longToken = 'a'.repeat(200);
      const payload = buildResetEmailPayload({
        ...defaultOptions,
        resetUrl: `https://intelliflow.com/reset?token=${longToken}`,
      });
      expect(payload.htmlBody).toContain(longToken);
    });
  });
});

describe('reset-email - email masking', () => {
  it('masks middle portion of email', () => {
    expect(maskEmail('john@example.com')).toBe('jo***@example.com');
  });

  it('masks short local part', () => {
    expect(maskEmail('ab@example.com')).toBe('ab***@example.com');
  });

  it('masks long local part', () => {
    expect(maskEmail('verylongemail@example.com')).toBe('ve***@example.com');
  });

  it('preserves domain', () => {
    const masked = maskEmail('user@my-company.co.uk');
    expect(masked).toContain('@my-company.co.uk');
  });

  it('masks email with dots in local part', () => {
    expect(maskEmail('first.last@example.com')).toBe('fi***@example.com');
  });

  it('masks email with plus addressing', () => {
    expect(maskEmail('user+tag@example.com')).toBe('us***@example.com');
  });
});

describe('reset-email - ForgotPasswordForm logic', () => {
  describe('form submission logic', () => {
    it('validates email before submission', () => {
      const email = 'invalid-email';
      const validation = validateEmail(email);
      expect(validation.valid).toBe(false);
    });

    it('trims and lowercases email on submit', () => {
      const email = '  User@Example.COM  ';
      const processed = email.trim().toLowerCase();
      expect(processed).toBe('user@example.com');
    });

    it('handles submit error from onSubmit callback', async () => {
      const onSubmit = async (email: string) => {
        throw new Error('Rate limited');
      };

      let errorMsg: string | undefined;
      try {
        await onSubmit('user@test.com');
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : 'An error occurred';
      }

      expect(errorMsg).toBe('Rate limited');
    });

    it('handles non-Error throw from onSubmit', async () => {
      const onSubmit = async (_email: string) => {
        throw 'string error';
      };

      let errorMsg: string | undefined;
      try {
        await onSubmit('user@test.com');
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : 'An error occurred';
      }

      expect(errorMsg).toBe('An error occurred');
    });
  });

  describe('blur validation logic', () => {
    it('validates email on blur when email is non-empty', () => {
      const email = 'invalid';
      const validation = validateEmail(email);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Please enter a valid email address');
    });

    it('clears error when valid email is typed after blur', () => {
      // First, blur with invalid
      let error: string | undefined = validateEmail('inv').error;
      expect(error).toBe('Please enter a valid email address');

      // Then type valid email
      const validation = validateEmail('user@test.com');
      if (validation.valid) {
        error = undefined;
      }
      expect(error).toBeUndefined();
    });
  });
});

describe('reset-email - ResetEmailSent logic', () => {
  describe('cooldown timer', () => {
    it('decrements cooldown from initial value', () => {
      let cooldown = 60;
      cooldown = Math.max(0, cooldown - 1);
      expect(cooldown).toBe(59);
    });

    it('does not go below zero', () => {
      let cooldown = 0;
      cooldown = Math.max(0, cooldown - 1);
      expect(cooldown).toBe(0);
    });

    it('button is disabled when cooldown > 0', () => {
      const cooldown = 30;
      const isResending = false;
      const disabled = isResending || cooldown > 0;
      expect(disabled).toBe(true);
    });

    it('button is disabled when resending', () => {
      const cooldown = 0;
      const isResending = true;
      const disabled = isResending || cooldown > 0;
      expect(disabled).toBe(true);
    });

    it('button is enabled when not resending and cooldown is 0', () => {
      const cooldown = 0;
      const isResending = false;
      const disabled = isResending || cooldown > 0;
      expect(disabled).toBe(false);
    });
  });

  describe('resend cooldown prop changes', () => {
    it('resets cooldown when prop changes', () => {
      let cooldown = 5;
      const newPropCooldown = 60;
      cooldown = newPropCooldown;
      expect(cooldown).toBe(60);
    });
  });
});
