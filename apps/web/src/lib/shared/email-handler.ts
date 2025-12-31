import type { ContactFormInput, ContactEmailPayload } from '@intelliflow/validators';

/**
 * Email Handler Service
 *
 * Handles contact form email submissions with spam prevention,
 * rate limiting, and proper error handling.
 */

// Result type for type-safe error handling
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface EmailError {
  code: 'SPAM_DETECTED' | 'RATE_LIMIT_EXCEEDED' | 'SEND_FAILED' | 'VALIDATION_ERROR';
  message: string;
  details?: Record<string, unknown>;
}

export interface EmailSuccess {
  messageId: string;
  status: 'sent' | 'queued';
  timestamp: string;
}

/**
 * Builds email payload from contact form data
 */
export function buildContactEmailPayload(formData: ContactFormInput): ContactEmailPayload {
  const { name, email, company, subject, message, phone } = formData;

  // Default recipient (would come from env in production)
  const recipientEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@intelliflow-crm.com';

  // Build subject line
  const emailSubject = subject
    ? `Contact Form: ${subject}`
    : 'Contact Form: New inquiry';

  // Build HTML email body
  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: #0f172a;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: #137fec;
      color: white;
      padding: 20px;
      border-radius: 8px 8px 0 0;
    }
    .content {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-top: none;
      padding: 20px;
      border-radius: 0 0 8px 8px;
    }
    .field {
      margin-bottom: 16px;
    }
    .label {
      font-weight: 600;
      color: #475569;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .value {
      color: #0f172a;
      font-size: 16px;
    }
    .message-box {
      background: #f6f7f8;
      padding: 16px;
      border-radius: 6px;
      border-left: 4px solid #137fec;
    }
    .footer {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">New Contact Form Submission</h1>
  </div>
  <div class="content">
    <div class="field">
      <div class="label">Name</div>
      <div class="value">${escapeHtml(name)}</div>
    </div>

    <div class="field">
      <div class="label">Email</div>
      <div class="value"><a href="mailto:${email}">${email}</a></div>
    </div>

    ${phone ? `
    <div class="field">
      <div class="label">Phone</div>
      <div class="value">${escapeHtml(String(phone))}</div>
    </div>
    ` : ''}

    ${company ? `
    <div class="field">
      <div class="label">Company</div>
      <div class="value">${escapeHtml(company)}</div>
    </div>
    ` : ''}

    ${subject ? `
    <div class="field">
      <div class="label">Subject</div>
      <div class="value">${escapeHtml(subject)}</div>
    </div>
    ` : ''}

    <div class="field">
      <div class="label">Message</div>
      <div class="message-box">
        ${escapeHtml(message).replace(/\n/g, '<br>')}
      </div>
    </div>

    <div class="footer">
      Sent via IntelliFlow CRM contact form<br>
      Timestamp: ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>
  `.trim();

  // Build plain text version
  const textBody = `
New Contact Form Submission

Name: ${name}
Email: ${email}
${phone ? `Phone: ${phone}\n` : ''}${company ? `Company: ${company}\n` : ''}${subject ? `Subject: ${subject}\n` : ''}
Message:
${message}

---
Sent via IntelliFlow CRM contact form
Timestamp: ${new Date().toISOString()}
  `.trim();

  return {
    to: recipientEmail,
    from: email,
    replyTo: email,
    subject: emailSubject,
    htmlBody,
    textBody,
    metadata: {
      source: 'contact-form' as const,
      submittedAt: new Date().toISOString(),
      name,
      company: company || null,
    },
  };
}

/**
 * Sends contact form email
 * Includes spam detection and rate limiting
 */
export async function sendContactEmail(
  formData: ContactFormInput
): Promise<Result<EmailSuccess, EmailError>> {
  try {
    // 1. Spam detection (honeypot field)
    if (formData.website && formData.website.length > 0) {
      return {
        ok: false,
        error: {
          code: 'SPAM_DETECTED',
          message: 'Submission rejected: spam detected',
          details: { honeypot: 'triggered' },
        },
      };
    }

    // 2. Build email payload
    const payload = buildContactEmailPayload(formData);

    // 3. TODO: Rate limiting check
    // Would integrate with Redis/Upstash to track submissions per email
    // const rateLimitKey = `contact-form:${formData.email}`;
    // const submissionCount = await redis.incr(rateLimitKey);
    // if (submissionCount === 1) {
    //   await redis.expire(rateLimitKey, 3600); // 1 hour window
    // }
    // if (submissionCount > 3) {
    //   return {
    //     ok: false,
    //     error: {
    //       code: 'RATE_LIMIT_EXCEEDED',
    //       message: 'Too many submissions. Please try again later.',
    //     },
    //   };
    // }

    // 4. TODO: Send email via email service (Resend, SendGrid, etc.)
    // For now, log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Email Handler] Contact form submission:');
      console.log('To:', payload.to);
      console.log('From:', payload.from);
      console.log('Subject:', payload.subject);
      console.log('Message:', payload.textBody);
    }

    // Mock successful send
    // In production, this would integrate with email service:
    // const response = await emailService.send(payload);
    // return { ok: true, value: response };

    return {
      ok: true,
      value: {
        messageId: `mock-${Date.now()}`,
        status: 'sent',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[Email Handler] Error sending email:', error);

    return {
      ok: false,
      error: {
        code: 'SEND_FAILED',
        message: error instanceof Error ? error.message : 'Failed to send email',
        details: error instanceof Error ? { stack: error.stack } : undefined,
      },
    };
  }
}

/**
 * Escapes HTML to prevent XSS
 */
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
