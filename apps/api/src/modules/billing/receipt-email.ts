/**
 * Brand-matched content for billing receipt emails.
 *
 * Builds the subject, plain-text body, and the IntelliFlow-branded HTML body (same dark
 * palette as the Supabase Auth templates + the notifications-worker shell) so receipts match
 * the rest of the system's email instead of bare `<p>` tags. Pure function — easy to test.
 *
 * @module billing/receipt-email
 */

export interface ReceiptEmailInput {
  receiptNumber: string;
  amountFormatted: string;
  status: string;
  paidAt?: Date;
  hostedInvoiceUrl?: string;
}

export interface ReceiptEmailContent {
  subject: string;
  textBody: string;
  htmlBody: string;
}

/** Escape the five HTML-significant characters for safe interpolation. */
function esc(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPaidDate(paidAt?: Date): string | undefined {
  if (!paidAt) return undefined;
  return paidAt.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function row(label: string, value: string): string {
  return (
    '<tr>' +
    `<td style="padding:8px 0;color:#94a3b8;font-size:14px;">${esc(label)}</td>` +
    `<td style="padding:8px 0;color:#ffffff;font-size:14px;font-weight:600;text-align:right;">${esc(value)}</td>` +
    '</tr>'
  );
}

function buildHtml(data: ReceiptEmailInput, paidDate?: string): string {
  const button = data.hostedInvoiceUrl
    ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0 0;"><tr><td style="text-align:center;">' +
      `<a href="${esc(data.hostedInvoiceUrl)}" style="display:inline-block;padding:14px 32px;background-color:#137fec;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">View receipt online</a>` +
      '</td></tr></table>'
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${esc(data.receiptNumber)}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#0f172a;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">Your IntelliFlow CRM receipt ${esc(data.receiptNumber)} — ${esc(data.amountFormatted)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <tr><td>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:32px;"><tr><td style="text-align:center;">
        <span style="display:inline-block;padding:8px 16px;background:linear-gradient(135deg,#137fec 0%,#7cc4ff 100%);border-radius:8px;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:1px;">INTELLIFLOW</span>
      </td></tr></table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1e293b;border-radius:16px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 8px 0;color:#ffffff;font-size:22px;font-weight:600;">Receipt ${esc(data.receiptNumber)}</h1>
          <p style="margin:0 0 24px 0;color:#94a3b8;font-size:16px;line-height:1.6;">Thanks for your payment. Here's your receipt from IntelliFlow CRM.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #334155;border-bottom:1px solid #334155;">
            ${row('Receipt', data.receiptNumber)}
            ${row('Amount', data.amountFormatted)}
            ${row('Status', data.status)}
            ${paidDate ? row('Paid', paidDate) : ''}
          </table>
          ${button}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:32px;"><tr><td style="text-align:center;color:#64748b;font-size:12px;">
        <p style="margin:0;">&copy; 2026 IntelliFlow CRM. All rights reserved.</p>
        <p style="margin:8px 0 0 0;">Billing &middot; crm@leangency.com</p>
      </td></tr></table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Build the subject, plain-text, and branded HTML for a receipt email. */
export function buildReceiptEmail(data: ReceiptEmailInput): ReceiptEmailContent {
  const paidDate = formatPaidDate(data.paidAt);
  const subject = `Your Receipt ${data.receiptNumber} from IntelliFlow`;
  const textBody = [
    `Receipt: ${data.receiptNumber}`,
    `Amount: ${data.amountFormatted}`,
    `Status: ${data.status}`,
    paidDate ? `Paid: ${paidDate}` : '',
    data.hostedInvoiceUrl ? `\nView receipt: ${data.hostedInvoiceUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, textBody, htmlBody: buildHtml(data, paidDate) };
}
