import { describe, expect, it } from 'vitest';
import { sanitizeSignatureHtml } from '../signature-sanitizer';

describe('sanitizeSignatureHtml (SEC-10)', () => {
  it('keeps ordinary signature markup', () => {
    const html =
      '<p><strong>Jane Doe</strong><br>Sales<br><a href="https://example.com">example.com</a> · <a href="mailto:jane@example.com">mail</a></p><img src="https://cdn.example.com/logo.png" alt="Logo" width="120" height="40">';
    const out = sanitizeSignatureHtml(html);
    expect(out).toContain('<strong>Jane Doe</strong>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('href="mailto:jane@example.com"');
    expect(out).toContain('src="https://cdn.example.com/logo.png"');
  });

  it('forces rel="noopener noreferrer" and target _blank on links', () => {
    expect(sanitizeSignatureHtml('<a href="https://example.com">x</a>')).toContain(
      'rel="noopener noreferrer"'
    );
  });

  it.each([
    ['script tag', '<p>a</p><script>alert(1)</script>', 'alert'],
    ['event handler', '<img src="https://x.example/a.png" onerror="alert(1)">', 'onerror'],
    ['javascript: link', '<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ['data: image', '<img src="data:image/png;base64,AAAA">', 'data:'],
    ['http image (tracking over plaintext)', '<img src="http://x.example/a.png">', 'http://x'],
    ['data: html link', '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', 'data:'],
    ['svg', '<svg><script>alert(1)</script></svg>', 'svg'],
    ['iframe', '<iframe src="https://x.example"></iframe>', 'iframe'],
    ['style expression', '<p style="width: expression(alert(1))">x</p>', 'expression'],
    ['style url()', '<p style="background: url(https://x.example/t.png)">x</p>', 'url('],
    ['form', '<form action="https://x.example"><input></form>', 'form'],
    ['object', '<object data="https://x.example/x.swf"></object>', 'object'],
  ])('removes %s', (_label, html, forbidden) => {
    expect(sanitizeSignatureHtml(html).toLowerCase()).not.toContain(forbidden);
  });

  it('keeps simple colour and font styles only', () => {
    const out = sanitizeSignatureHtml(
      '<span style="color: #333333; font-weight: bold; position: fixed; text-align: center">x</span>'
    );
    expect(out).toContain('color:#333333');
    expect(out).toContain('font-weight:bold');
    expect(out).toContain('text-align:center');
    expect(out).not.toContain('position');
  });

  it('returns an empty string for nothing usable', () => {
    expect(sanitizeSignatureHtml('<script>x</script>')).toBe('');
  });
});
