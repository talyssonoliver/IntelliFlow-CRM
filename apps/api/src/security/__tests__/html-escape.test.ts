/**
 * PG-203 — escapeHtml / stripLineBreaks for user-supplied text in booking emails (runner R4).
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, stripLineBreaks } from '../html-escape';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>Tom & Jerry</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;'
    );
  });

  it('neutralises a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes ampersands first so existing entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('stringifies non-string input and maps null/undefined to an empty string', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('stripLineBreaks', () => {
  it('collapses CR/LF and other control characters into single spaces (header injection)', () => {
    expect(stripLineBreaks('Intro\r\nBcc: victim@example.invalid')).toBe(
      'Intro Bcc: victim@example.invalid'
    );
    expect(stripLineBreaks('a\tb\u0000c')).toBe('a b c');
    expect(stripLineBreaks('  plain  ')).toBe('plain');
  });
});
