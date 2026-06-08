/**
 * Brand-matched HTML shell for notification emails.
 *
 * The notifications-worker delivers ~54 notification types over a single email
 * channel. This wraps each one in the IntelliFlow CRM brand (the same palette as
 * the Supabase Auth templates in supabase/templates/ and the app's reset-email
 * component) so every notification email looks consistent with the auth emails —
 * instead of a bare, unbranded body.
 *
 * @module notifications-worker/templates
 */

export interface NotificationEmailInput {
  /** Email subject / headline. */
  subject?: string;
  /** Plain-text body (always present; used as the fallback + when no htmlBody). */
  body: string;
  /** Optional pre-rendered HTML body (from a NotificationService template). */
  htmlBody?: string;
  /** Notification priority — drives an optional priority pill. */
  priority?: string;
}

/** Escape the five HTML-significant characters for safe text interpolation. */
export function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function priorityPill(priority?: string): string {
  const p = (priority || '').toUpperCase();
  if (p !== 'URGENT' && p !== 'HIGH') return '';
  const label = p === 'URGENT' ? 'Urgent' : 'High priority';
  return (
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px 0;"><tr><td style="text-align:center;">' +
    `<span style="display:inline-block;padding:4px 12px;background-color:#3a2a14;border-radius:999px;color:#fbbf24;font-size:12px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">${label}</span>` +
    '</td></tr></table>'
  );
}

/**
 * Wrap a notification's content in the IntelliFlow CRM brand shell.
 *
 * - Prefers `htmlBody` (rendered upstream) as the inner content; otherwise
 *   renders the escaped plain-text `body` with line breaks preserved.
 * - Adds a hidden preheader (inbox preview), the INTELLIFLOW wordmark, an optional
 *   priority pill, and the standard footer.
 */
export function renderNotificationEmail(input: NotificationEmailInput): string {
  const title = (input.subject || 'Notification').trim();
  const preheader = input.body.replace(/\s+/g, ' ').trim().slice(0, 140);
  const inner = input.htmlBody
    ? input.htmlBody
    : `<p style="margin:0;color:#94a3b8;font-size:16px;line-height:1.6;">${escapeHtml(
        input.body
      ).replaceAll('\n', '<br>')}</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#0f172a;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <tr><td>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:32px;"><tr><td style="text-align:center;">
        <span style="display:inline-block;padding:8px 16px;background:linear-gradient(135deg,#137fec 0%,#7cc4ff 100%);border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:1px;">INTELLIFLOW</span>
      </td></tr></table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1e293b;border-radius:16px;padding:32px;">
        <tr><td>
          ${priorityPill(input.priority)}
          <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:22px;font-weight:600;">${escapeHtml(title)}</h1>
          ${inner}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:32px;"><tr><td style="text-align:center;color:#64748b;font-size:12px;">
        <p style="margin:0;">You're receiving this because of your IntelliFlow CRM notification settings.</p>
        <p style="margin:8px 0 0 0;">&copy; 2026 IntelliFlow CRM &middot; crm@leangency.com</p>
      </td></tr></table>
    </td></tr>
  </table>
</body>
</html>`;
}
