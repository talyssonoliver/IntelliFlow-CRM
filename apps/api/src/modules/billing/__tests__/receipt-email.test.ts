import { describe, it, expect } from 'vitest';
import { buildReceiptEmail } from '../receipt-email';

describe('buildReceiptEmail', () => {
  const base = {
    receiptNumber: 'RC-1001',
    amountFormatted: '£167.00',
    status: 'paid',
  };

  it('builds subject and plain-text body', () => {
    const { subject, textBody } = buildReceiptEmail(base);
    expect(subject).toBe('Your Receipt RC-1001 from IntelliFlow');
    expect(textBody).toContain('Receipt: RC-1001');
    expect(textBody).toContain('Amount: £167.00');
    expect(textBody).toContain('Status: paid');
  });

  it('wraps the HTML in the IntelliFlow brand shell', () => {
    const { htmlBody } = buildReceiptEmail(base);
    expect(htmlBody).toContain('<!DOCTYPE html>');
    expect(htmlBody).toContain('INTELLIFLOW');
    expect(htmlBody).toContain('#137fec');
    expect(htmlBody).toContain('background-color:#0f172a');
    expect(htmlBody).toContain('crm@leangency.com');
    expect(htmlBody).toContain('>Receipt RC-1001</h1>');
    expect(htmlBody).toContain('£167.00');
  });

  it('formats and shows the Paid row/line only when paidAt is given', () => {
    const paidAt = new Date('2026-06-09T12:00:00Z');
    const withPaid = buildReceiptEmail({ ...base, paidAt });
    expect(withPaid.htmlBody).toContain('9 Jun 2026');
    expect(withPaid.textBody).toContain('Paid: 9 Jun 2026');

    const noPaid = buildReceiptEmail(base);
    expect(noPaid.htmlBody).not.toContain('Paid');
    expect(noPaid.textBody).not.toContain('Paid:');
  });

  it('shows the "View receipt online" button + text link only with a hostedInvoiceUrl', () => {
    const withUrl = buildReceiptEmail({ ...base, hostedInvoiceUrl: 'https://pay.example/r' });
    expect(withUrl.htmlBody).toContain('https://pay.example/r');
    expect(withUrl.htmlBody).toContain('View receipt online');
    expect(withUrl.textBody).toContain('View receipt: https://pay.example/r');

    const noUrl = buildReceiptEmail(base);
    expect(noUrl.htmlBody).not.toContain('View receipt online');
  });

  it('escapes HTML in inputs (no injection)', () => {
    const { htmlBody } = buildReceiptEmail({ ...base, status: '<script>x</script>' });
    expect(htmlBody).not.toContain('<script>x</script>');
    expect(htmlBody).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});
