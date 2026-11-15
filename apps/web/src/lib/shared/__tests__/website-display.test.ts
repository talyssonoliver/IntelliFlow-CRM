import { describe, it, expect } from 'vitest';
import { websiteDisplay } from '../website-display';

describe('websiteDisplay', () => {
  it('labels with the bare domain and keeps the real path', () => {
    expect(websiteDisplay('https://www.Example.co.uk/shop/')).toEqual({
      href: 'https://www.example.co.uk/shop/',
      domain: 'example.co.uk',
    });
  });

  it('adds https to an address stored without a scheme', () => {
    expect(websiteDisplay('example.com')).toEqual({
      href: 'https://example.com/',
      domain: 'example.com',
    });
  });

  it('drops tracking parameters and keeps the others', () => {
    const result = websiteDisplay(
      'http://example.com/p?utm_source=a&UTM_Medium=b&fbclid=c&gclid=d&msclkid=e&_hsenc=f&q=shoes'
    );
    expect(result).toEqual({ href: 'http://example.com/p?q=shoes', domain: 'example.com' });
  });

  it('labels an international domain as stored, not in punycode', () => {
    const result = websiteDisplay('https://www.münchen.de/start');
    expect(result?.domain).toBe('münchen.de');
    expect(result?.href).toBe('https://www.xn--mnchen-3ya.de/start');
  });

  it('never labels a link with a different site from the one it opens', () => {
    const result = websiteDisplay(String.raw`https://evil.example\@good.example`);
    expect(result?.href).toBe('https://evil.example/@good.example');
    expect(result?.domain).toBe('evil.example');
  });

  it('drops user info and port from the label', () => {
    expect(websiteDisplay('http://user@example.com:8080/x')?.domain).toBe('example.com');
  });

  it('reads the value objects the API can return', () => {
    expect(websiteDisplay({ normalized: 'https://a.example.com' })?.domain).toBe('a.example.com');
    expect(websiteDisplay({ value: 'b.example.com' })?.domain).toBe('b.example.com');
  });

  it.each([
    null,
    undefined,
    '',
    '   ',
    42,
    { other: 'x' },
    'javascript:alert(1)',
    'ftp://example.com',
    'localhost',
    'http://',
  ])('returns null for %j', (input) => {
    expect(websiteDisplay(input)).toBeNull();
  });
});
