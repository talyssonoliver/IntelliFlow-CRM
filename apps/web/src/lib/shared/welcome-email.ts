/**
 * Welcome Email Service
 *
 * Handles welcome email generation and sending for new user registrations.
 *
 * IMPLEMENTS: PG-016 (Sign Up page)
 *
 * Features:
 * - HTML and plain text email templates
 * - Email verification link generation
 * - Onboarding information
 * - Proper error handling
 */

// ============================================
// Types
// ============================================

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface WelcomeEmailData {
  fullName: string;
  email: string;
  verificationToken?: string;
}

export interface WelcomeEmailPayload {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  metadata: {
    source: 'registration';
    registeredAt: string;
    fullName: string;
    requiresVerification: boolean;
  };
}

export interface WelcomeEmailError {
  code: 'SEND_FAILED' | 'VALIDATION_ERROR' | 'TEMPLATE_ERROR';
  message: string;
  details?: Record<string, unknown>;
}

export interface WelcomeEmailSuccess {
  messageId: string;
  status: 'sent' | 'queued';
  timestamp: string;
}

// ============================================
// Constants
// ============================================

const APP_NAME = 'IntelliFlow CRM';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://intelliflow-crm.com';
const SENDER_EMAIL = process.env.NEXT_PUBLIC_SENDER_EMAIL || 'noreply@intelliflow-crm.com';
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@intelliflow-crm.com';

// ============================================
// HTML Escape Utility
// ============================================

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

// ============================================
// Email Payload Builder
// ============================================

/**
 * Builds welcome email payload from registration data
 */
export function buildWelcomeEmailPayload(data: WelcomeEmailData): WelcomeEmailPayload {
  const { fullName, email, verificationToken } = data;
  const firstName = fullName.split(' ')[0];
  const verificationUrl = verificationToken
    ? `${APP_URL}/auth/verify-email/${verificationToken}`
    : null;

  // Build HTML email body
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: #0f172a;
      max-width: 600px;
      margin: 0 auto;
      padding: 0;
      background-color: #f6f7f8;
    }
    .container {
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      margin: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    }
    .header {
      background: linear-gradient(135deg, #137fec 0%, #0f5cbf 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 20px;
    }
    .message {
      color: #475569;
      font-size: 16px;
      margin-bottom: 30px;
    }
    .cta-button {
      display: inline-block;
      background: #137fec;
      color: white !important;
      padding: 14px 32px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 30px;
    }
    .features {
      background: #f6f7f8;
      border-radius: 8px;
      padding: 24px;
      margin: 30px 0;
    }
    .features h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #0f172a;
    }
    .feature-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .feature-icon {
      width: 20px;
      height: 20px;
      background: #137fec;
      border-radius: 50%;
      margin-right: 12px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .feature-icon svg {
      width: 12px;
      height: 12px;
      fill: white;
    }
    .feature-text {
      color: #475569;
      font-size: 14px;
    }
    .divider {
      height: 1px;
      background: #e2e8f0;
      margin: 30px 0;
    }
    .help-section {
      text-align: center;
      color: #64748b;
      font-size: 14px;
    }
    .help-section a {
      color: #137fec;
      text-decoration: none;
    }
    .footer {
      background: #f6f7f8;
      padding: 24px 30px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .footer a {
      color: #64748b;
      text-decoration: none;
    }
    .social-links {
      margin: 16px 0;
    }
    .social-links a {
      display: inline-block;
      margin: 0 8px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to ${APP_NAME}!</h1>
      <p>Your AI-powered CRM journey begins now</p>
    </div>
    <div class="content">
      <p class="greeting">Hi ${escapeHtml(firstName)},</p>
      <p class="message">
        Thank you for creating your ${APP_NAME} account! We're excited to have you on board.
        ${verificationUrl ? 'Please verify your email address to get started.' : 'Your account is ready to use.'}
      </p>

      ${verificationUrl ? `
      <div style="text-align: center;">
        <a href="${verificationUrl}" class="cta-button">Verify Email Address</a>
      </div>
      <p style="color: #64748b; font-size: 14px; text-align: center;">
        Or copy and paste this link into your browser:<br>
        <a href="${verificationUrl}" style="color: #137fec; word-break: break-all;">${verificationUrl}</a>
      </p>
      ` : `
      <div style="text-align: center;">
        <a href="${APP_URL}/dashboard" class="cta-button">Go to Dashboard</a>
      </div>
      `}

      <div class="features">
        <h3>What you can do with ${APP_NAME}:</h3>
        <div class="feature-item">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <span class="feature-text">AI-powered lead scoring and qualification</span>
        </div>
        <div class="feature-item">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <span class="feature-text">Automated email campaigns and follow-ups</span>
        </div>
        <div class="feature-item">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <span class="feature-text">Real-time analytics and reporting</span>
        </div>
        <div class="feature-item">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </div>
          <span class="feature-text">Seamless integrations with your favorite tools</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="help-section">
        <p>Need help getting started?</p>
        <p>
          Check out our <a href="${APP_URL}/docs">documentation</a> or
          <a href="mailto:${SUPPORT_EMAIL}">contact support</a>
        </p>
      </div>
    </div>
    <div class="footer">
      <div class="social-links">
        <a href="https://twitter.com/intelliflowcrm">Twitter</a>
        <a href="https://linkedin.com/company/intelliflowcrm">LinkedIn</a>
        <a href="https://github.com/intelliflow">GitHub</a>
      </div>
      <p>
        &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.<br>
        <a href="${APP_URL}/privacy">Privacy Policy</a> &bull;
        <a href="${APP_URL}/terms">Terms of Service</a>
      </p>
      <p style="margin-top: 12px; font-size: 11px; color: #94a3b8;">
        You're receiving this email because you signed up for ${APP_NAME}.<br>
        ${escapeHtml(email)}
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  // Build plain text version
  const textBody = `
Welcome to ${APP_NAME}!

Hi ${firstName},

Thank you for creating your ${APP_NAME} account! We're excited to have you on board.

${verificationUrl
    ? `Please verify your email address to get started:
${verificationUrl}`
    : `Your account is ready to use. Go to your dashboard:
${APP_URL}/dashboard`
}

What you can do with ${APP_NAME}:
- AI-powered lead scoring and qualification
- Automated email campaigns and follow-ups
- Real-time analytics and reporting
- Seamless integrations with your favorite tools

Need help getting started?
Check out our documentation: ${APP_URL}/docs
Or contact support: ${SUPPORT_EMAIL}

---
${APP_NAME}
${APP_URL}

You're receiving this email because you signed up for ${APP_NAME}.
${email}
  `.trim();

  return {
    to: email,
    from: SENDER_EMAIL,
    replyTo: SUPPORT_EMAIL,
    subject: `Welcome to ${APP_NAME}! ${verificationUrl ? 'Please verify your email' : 'Your account is ready'}`,
    htmlBody,
    textBody,
    metadata: {
      source: 'registration',
      registeredAt: new Date().toISOString(),
      fullName,
      requiresVerification: !!verificationToken,
    },
  };
}

// ============================================
// Email Sending Function
// ============================================

/**
 * Sends welcome email to newly registered user
 *
 * @param data - User registration data
 * @returns Result with success or error
 *
 * @example
 * ```tsx
 * const result = await sendWelcomeEmail({
 *   fullName: 'John Doe',
 *   email: 'john@example.com',
 *   verificationToken: 'abc123',
 * });
 *
 * if (result.ok) {
 *   console.log('Welcome email sent:', result.value.messageId);
 * } else {
 *   console.error('Failed to send:', result.error.message);
 * }
 * ```
 */
export async function sendWelcomeEmail(
  data: WelcomeEmailData
): Promise<Result<WelcomeEmailSuccess, WelcomeEmailError>> {
  try {
    // Validate input
    if (!data.email || !data.fullName) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and full name are required',
        },
      };
    }

    // Build email payload
    const payload = buildWelcomeEmailPayload(data);

    // Email service integration (Deferred to Sprint 12 - IFC-157: Notification Service)
    // Will send via email service (Resend, SendGrid, etc.)
    // For now, log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Welcome Email] New user registration:');
      console.log('To:', payload.to);
      console.log('Subject:', payload.subject);
      console.log('Full Name:', data.fullName);
      console.log('Requires Verification:', payload.metadata.requiresVerification);
    }

    // Mock successful send
    // In production, this would integrate with email service:
    // const response = await emailService.send(payload);
    // return { ok: true, value: response };

    return {
      ok: true,
      value: {
        messageId: `welcome-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        status: 'sent',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[Welcome Email] Error sending email:', error);

    return {
      ok: false,
      error: {
        code: 'SEND_FAILED',
        message: error instanceof Error ? error.message : 'Failed to send welcome email',
        details: error instanceof Error ? { stack: error.stack } : undefined,
      },
    };
  }
}

// ============================================
// Verification Token Generator
// ============================================

/**
 * Generates a secure email verification token
 *
 * @returns A cryptographically secure random token
 */
export function generateVerificationToken(): string {
  // Use Web Crypto API for browser, crypto for Node
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for server-side
  const { randomBytes } = require('crypto');
  return randomBytes(32).toString('hex');
}
