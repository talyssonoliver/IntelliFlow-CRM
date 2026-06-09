import { describe, it, expect } from 'vitest';
import { renderNotificationEmail, escapeHtml } from '../notification-email';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">A&B'C</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;A&amp;B&#39;C&lt;/a&gt;'
    );
  });
});

describe('renderNotificationEmail', () => {
  const base = { subject: 'Lead assigned', body: 'A new lead was assigned to you.' };

  it('wraps content in the IntelliFlow brand shell', () => {
    const html = renderNotificationEmail(base);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('INTELLIFLOW'); // wordmark
    expect(html).toContain('#137fec'); // brand accent
    expect(html).toContain('background-color:#0f172a'); // dark theme
    expect(html).toContain('crm@leangency.com'); // footer
  });

  it('uses the subject as the headline/title', () => {
    const html = renderNotificationEmail(base);
    expect(html).toContain('>Lead assigned</h1>');
    expect(html).toContain('<title>Lead assigned</title>');
  });

  it('falls back to "Notification" when no subject', () => {
    const html = renderNotificationEmail({ body: 'x' });
    expect(html).toContain('>Notification</h1>');
  });

  it('escapes a plain-text body (no raw HTML injection)', () => {
    const html = renderNotificationEmail({ subject: 'Hi', body: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('preserves a provided htmlBody as the inner content (not escaped)', () => {
    const html = renderNotificationEmail({
      subject: 'Rich',
      body: 'plain fallback',
      htmlBody: '<p class="rich">hello <strong>world</strong></p>',
    });
    expect(html).toContain('<p class="rich">hello <strong>world</strong></p>');
  });

  it('converts newlines in the text body to <br>', () => {
    const html = renderNotificationEmail({ subject: 'L', body: 'line1\nline2' });
    expect(html).toContain('line1<br>line2');
  });

  it('shows a priority pill for URGENT and HIGH only', () => {
    expect(renderNotificationEmail({ ...base, priority: 'URGENT' })).toContain('Urgent');
    expect(renderNotificationEmail({ ...base, priority: 'HIGH' })).toContain('High priority');
    const normal = renderNotificationEmail({ ...base, priority: 'NORMAL' });
    expect(normal).not.toContain('Urgent');
    expect(normal).not.toContain('High priority');
  });

  it('includes a hidden preheader derived from the body', () => {
    const html = renderNotificationEmail(base);
    expect(html).toContain('display:none');
    expect(html).toContain('A new lead was assigned to you.');
  });
});
