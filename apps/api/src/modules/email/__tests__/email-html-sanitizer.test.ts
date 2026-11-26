/**
 * The write-time sanitiser for the HTML of received and sent mail: layout survives, anything that
 * can run, load a page or track a reader does not.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeEmailHtml } from '../email-html-sanitizer';

const clean = (html: string): string => sanitizeEmailHtml(html) ?? '';

describe('sanitizeEmailHtml', () => {
  it('removes scripts, with their content', () => {
    const out = clean('<p>Hi</p><script>alert(document.cookie)</script>');
    expect(out).toBe('<p>Hi</p>');
    expect(out).not.toContain('alert');
  });

  it('removes event handlers on any tag', () => {
    const out = clean(
      '<img src="https://cdn.example.invalid/a.png" width="200" onerror="alert(1)" onload="x()">' +
        '<a href="https://example.invalid" onclick="steal()" onmouseover="y()">go</a>' +
        '<div onfocus="z()" style="color:red" onclick="q()">d</div>'
    );
    expect(out).not.toMatch(/\son[a-z]+\s*=/i);
    expect(out).toContain('https://cdn.example.invalid/a.png');
    expect(out).toContain('color:red');
  });

  it('removes javascript:, vbscript: and data: links', () => {
    const out = clean(
      '<a href="javascript:alert(1)">a</a><a href="vbscript:x">b</a>' +
        '<a href="data:text/html;base64,PHNjcmlwdD4=">c</a><a href="https://ok.example.invalid">d</a>'
    );
    expect(out).not.toMatch(/javascript:|vbscript:|data:/i);
    expect(out).toContain('https://ok.example.invalid');
  });

  it('removes style blocks, links, frames, forms, objects, svg, base and meta', () => {
    const out = clean(
      '<style>@import url(https://evil.example.invalid/x.css);body{background:url(https://t.example.invalid/p)}</style>' +
        '<link rel="stylesheet" href="https://evil.example.invalid/a.css"><base href="https://evil.example.invalid/">' +
        '<meta http-equiv="refresh" content="0;url=https://evil.example.invalid">' +
        '<iframe src="https://evil.example.invalid"></iframe><form action="https://evil.example.invalid"><input name="p"></form>' +
        '<object data="x"></object><embed src="x"><svg onload="x()"><circle/></svg><p>kept</p>'
    );
    expect(out).toBe('<p>kept</p>');
  });

  it('keeps table layout and the safe inline styles an email is designed with', () => {
    const out = clean(
      '<table width="600" cellpadding="0" align="center" bgcolor="#ffffff"><tbody><tr>' +
        '<td style="padding:16px 24px;font-family:Arial,sans-serif;font-size:16px;color:#111111;background-color:#f5f5f5" colspan="2">' +
        '<h1 style="margin:0">Title</h1><a href="https://example.invalid/x" style="text-decoration:none">Open</a></td></tr></tbody></table>'
    );
    expect(out).toContain('<table');
    expect(out).toContain('width="600"');
    expect(out).toContain('padding:16px 24px');
    expect(out).toContain('background-color:#f5f5f5');
    expect(out).toContain('<h1');
  });

  it('drops CSS that can load or script: url(), expression(), @import, position', () => {
    const out = clean(
      '<div style="background:url(https://t.example.invalid/p.gif);color:red">a</div>' +
        '<div style="width:expression(alert(1));height:10px">b</div>' +
        '<div style="position:fixed;top:0;left:0;background-image:url(x)">c</div>'
    );
    expect(out).not.toMatch(/url\(|expression|position|background-image/i);
    expect(out).toContain('color:red');
    expect(out).toContain('height:10px');
  });

  it('drops CSS functions that fetch an image other than url()', () => {
    const out = clean(
      '<div style="background:image-set(\'https://t.example.invalid/a.png\' 1x);color:red">a</div>' +
        '<div style="background-color:cross-fade(red, blue);width:10px">b</div>' +
        '<div style="background:element(#x);height:5px">c</div>'
    );
    expect(out).not.toMatch(/image-set|cross-fade|element\(|t\.example/i);
    expect(out).toContain('color:red');
    expect(out).toContain('width:10px');
  });

  it('removes tracking pixels (1x1 or hidden images) but keeps real remote images', () => {
    const out = clean(
      '<img src="https://track.example.invalid/open.gif" width="1" height="1">' +
        '<img src="https://track.example.invalid/o2.gif" style="width:0;height:0">' +
        '<img src="https://track.example.invalid/o3.gif" style="display:none">' +
        '<img src="https://cdn.example.invalid/hero.png" width="600" alt="Hero">'
    );
    expect(out).not.toContain('track.example.invalid');
    expect(out).toContain('https://cdn.example.invalid/hero.png');
  });

  it('does not let a line break hide a url() from the value check', () => {
    const out = clean(
      '<div style="background:linear-gradient(red,\nred),url(https://t.example.invalid/open)">a</div>' +
        '<div style="background:red\n;color:blue">b</div>'
    );
    expect(out).not.toContain('t.example.invalid');
  });

  it('keeps an image sized in relative units: 2em is a real size, not a pixel', () => {
    const out = clean(
      '<img src="cid:logo" style="height:2em;width:2em"><img src="cid:b" style="width:50%">'
    );
    expect(out).toContain('cid:logo');
    expect(out).toContain('cid:b');
  });

  it('catches pixels sized with !important, other units or upper case, and padded data: schemes', () => {
    const out = clean(
      '<img src="https://t.example.invalid/a.gif" style="width:1px !important;height:1px !important">' +
        '<img src="https://t.example.invalid/b.gif" style="width:0pt;height:0pt">' +
        '<img src="https://t.example.invalid/c.gif" style="height:1PX" width="50">' +
        '<img src=" data:image/svg+xml;base64,PHN2Zz4=" width="40">' +
        '<img src="da\tta:image/svg+xml;base64,PHN2Zz4=" width="40">' +
        '<img src="https://cdn.example.invalid/ok.png" width="300">'
    );
    expect(out).not.toMatch(/t\.example|svg/i);
    expect(out).toContain('https://cdn.example.invalid/ok.png');
  });

  it('keeps cid: images (inline attachments) and small raster data: images, drops other schemes', () => {
    const out = clean(
      '<img src="cid:logo@example.invalid" alt="logo">' +
        '<img src="data:image/png;base64,iVBORw0KGgo=" width="40">' +
        '<img src="data:image/svg+xml;base64,PHN2Zz4=" width="40">' +
        '<img src="http://plain.example.invalid/a.png" width="40">' +
        '<img src="javascript:alert(1)" width="40">'
    );
    expect(out).toContain('cid:logo@example.invalid');
    expect(out).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(out).not.toMatch(/svg\+xml|plain\.example|javascript:/);
  });

  it('forces noopener and a new tab on links, and drops srcset and background attributes', () => {
    const out = clean(
      '<a href="https://example.invalid" target="_self" rel="opener">a</a>' +
        '<img src="https://cdn.example.invalid/a.png" srcset="https://t.example.invalid/2x.png 2x" width="50">' +
        '<table background="https://t.example.invalid/bg.png"><tr><td>x</td></tr></table>'
    );
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
    expect(out).not.toMatch(/srcset|background=|t\.example\.invalid/);
  });

  it('returns null when nothing readable is left, so the text body is used', () => {
    expect(sanitizeEmailHtml('<script>x()</script>')).toBeNull();
    expect(sanitizeEmailHtml('')).toBeNull();
    expect(sanitizeEmailHtml(null)).toBeNull();
  });
});
