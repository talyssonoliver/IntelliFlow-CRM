import { describe, expect, it, vi } from 'vitest';
import {
  instrumentHtml,
  isValidSignature,
  trackingBaseUrl,
  trackingSignature,
} from '../email-tracking';

const RECORD = 'rec' + 'ord1234567890abcdefgh';
const ENV = {
  API_PUBLIC_URL: 'https://api.example.invalid',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;
const OFF = { trackOpens: false, trackClicks: false };
const HTML =
  '<html><body><p>Hi</p><a href="https://shop.example.invalid/a?x=1&amp;y=2">A</a> ' +
  '<a href=\'http://plain.example.invalid/b\'>B</a> <a href="mailto:me@example.invalid">M</a> ' +
  '<a href="#top">T</a></body></html>';

describe('trackingBaseUrl', () => {
  it('is the origin of API_PUBLIC_URL, https only in production, null when missing or invalid', () => {
    expect(trackingBaseUrl(ENV)).toBe('https://api.example.invalid');
    expect(
      trackingBaseUrl({ API_PUBLIC_URL: 'http://x.example.invalid', NODE_ENV: 'production' })
    ).toBeNull();
    expect(trackingBaseUrl({ API_PUBLIC_URL: 'http://x.example.invalid', NODE_ENV: 'test' })).toBe(
      'http://x.example.invalid'
    );
    expect(trackingBaseUrl({})).toBeNull();
    expect(trackingBaseUrl({ API_PUBLIC_URL: 'not a url' })).toBeNull();
  });
});

describe('signatures', () => {
  it('verify for the record and link they were made for, and for nothing else', () => {
    const open = trackingSignature('o', RECORD);
    expect(open).toHaveLength(32);
    expect(isValidSignature('o', RECORD, open)).toBe(true);
    expect(isValidSignature('o', RECORD + 'x', open)).toBe(false);
    expect(isValidSignature('c', RECORD, open, '')).toBe(false);

    const click = trackingSignature('c', RECORD, 'https://a.example.invalid/');
    expect(isValidSignature('c', RECORD, click, 'https://a.example.invalid/')).toBe(true);
    expect(isValidSignature('c', RECORD, click, 'https://evil.example.invalid/')).toBe(false);
    expect(isValidSignature('o', RECORD, 'short')).toBe(false);
  });
});

describe('instrumentHtml', () => {
  it('returns the html byte for byte when both settings are off', () => {
    expect(instrumentHtml(HTML, RECORD, OFF, ENV)).toBe(HTML);
  });

  it('adds only the pixel when only opens are on', () => {
    const out = instrumentHtml(HTML, RECORD, { trackOpens: true, trackClicks: false }, ENV);
    const pixel = `https://api.example.invalid/t/o/${RECORD}/${trackingSignature('o', RECORD)}.gif`;
    expect(out).toContain(`<img src="${pixel}"`);
    expect(out.indexOf('<img')).toBeLessThan(out.indexOf('</body>'));
    expect(out).toContain('href="https://shop.example.invalid/a?x=1&amp;y=2"');
    expect(out).not.toContain('/t/c/');
  });

  it('rewrites only http(s) links when only clicks are on, and adds no pixel', () => {
    const out = instrumentHtml(HTML, RECORD, { trackOpens: false, trackClicks: true }, ENV);
    const target = 'https://shop.example.invalid/a?x=1&y=2';
    const sig = trackingSignature('c', RECORD, target);
    expect(out).toContain(
      `href="https://api.example.invalid/t/c/${RECORD}/${sig}?u=${encodeURIComponent(target)}"`
    );
    expect(out).toContain(`href='https://api.example.invalid/t/c/${RECORD}/`);
    expect(out).toContain('href="mailto:me@example.invalid"');
    expect(out).toContain('href="#top"');
    expect(out).not.toContain('<img');
  });

  it('puts the pixel at the end when there is no body tag', () => {
    const out = instrumentHtml('<p>Hi</p>', RECORD, { trackOpens: true, trackClicks: true }, ENV);
    expect(out.startsWith('<p>Hi</p><img src=')).toBe(true);
  });

  it('sends the html untouched, with a log line, when the public address is not usable', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = instrumentHtml(HTML, RECORD, { trackOpens: true, trackClicks: true }, {} as never);
    expect(out).toBe(HTML);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('keeps an unclosed href as it was', () => {
    const broken = '<a href="https://x.example.invalid/a';
    expect(instrumentHtml(broken, RECORD, { trackOpens: false, trackClicks: true }, ENV)).toBe(
      broken
    );
  });
});
