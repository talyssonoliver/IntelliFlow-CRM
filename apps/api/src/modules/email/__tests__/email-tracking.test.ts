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

/** Every tracked link in the html, read back the way the redirect route reads it. */
function trackedLinks(
  html: string
): Array<{ recordId: string; signature: string; target: string }> {
  const found: Array<{ recordId: string; signature: string; target: string }> = [];
  for (const part of html.split('https://api.example.invalid/t/c/').slice(1)) {
    const [path, rest = ''] = part.split('?u=');
    const [recordId = '', signature = ''] = path!.split('/');
    const raw = decodeURIComponent(rest.split(/["'\s]/)[0] ?? '');
    found.push({ recordId, signature, target: new URL(raw).toString() });
  }
  return found;
}

const CLICKS = { trackOpens: false, trackClicks: true };

describe('instrumentHtml: tracked links verify exactly as the redirect reads them', () => {
  it.each([
    [
      'a bare host',
      '<a href="https://shop.example.invalid">x</a>',
      'https://shop.example.invalid/',
    ],
    [
      'an upper case scheme and host',
      '<a href="HTTPS://Shop.Example.invalid/A">x</a>',
      'https://shop.example.invalid/A',
    ],
    [
      'spaces and non-ASCII characters',
      '<a href="https://shop.example.invalid/a b/é">x</a>',
      'https://shop.example.invalid/a%20b/%C3%A9',
    ],
    [
      'a default port',
      '<a href="https://shop.example.invalid:443/p">x</a>',
      'https://shop.example.invalid/p',
    ],
    [
      'a numeric character reference',
      '<a href="https://shop.example.invalid/a?x=1&#38;y=2">x</a>',
      'https://shop.example.invalid/a?x=1&y=2',
    ],
    [
      'a hex reference and a quote reference',
      '<a href="https://shop.example.invalid/a?x=1&#x26;q=&quot;">x</a>',
      'https://shop.example.invalid/a?x=1&q=%22',
    ],
    [
      'an upper case HREF with spaces around the equals sign',
      '<A CLASS="b" HREF = "https://shop.example.invalid/z">x</A>',
      'https://shop.example.invalid/z',
    ],
  ])('%s', (_name, html, expected) => {
    const out = instrumentHtml(html, RECORD, CLICKS, ENV);
    const links = trackedLinks(out);
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe(expected);
    expect(links[0]!.recordId).toBe(RECORD);
    expect(isValidSignature('c', RECORD, links[0]!.signature, links[0]!.target)).toBe(true);
  });

  it('reads attributes quote by quote: href text inside another value is not the link', () => {
    const html = `<a title="See href='https://docs.example.invalid/" href='https://shop.example.invalid/'>Shop</a>`;
    const out = instrumentHtml(html, RECORD, CLICKS, ENV);
    expect(
      out.startsWith(
        `<a title="See href='https://docs.example.invalid/" href='https://api.example.invalid/t/c/`
      )
    ).toBe(true);
    const links = trackedLinks(out);
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('https://shop.example.invalid/');
  });

  it('tracks an anchor whose earlier attribute holds a ">" and one with other attributes after the href', () => {
    const html =
      '<a title="Spend > £10" href="https://shop.example.invalid/a" target="_blank" class=x>A</a>' +
      '<a href="https://shop.example.invalid/b" data-x=\'1>2\'>B</a>';
    const out = instrumentHtml(html, RECORD, CLICKS, ENV);
    expect(trackedLinks(out).map((link) => link.target)).toEqual([
      'https://shop.example.invalid/a',
      'https://shop.example.invalid/b',
    ]);
    expect(out).toContain('title="Spend > £10"');
    expect(out).toContain(`target="_blank" class=x>A</a>`);
    expect(out).toContain(`data-x='1>2'>B</a>`);
  });

  it('uses only the first href of a tag, as a browser does', () => {
    const html = '<a href="https://one.example.invalid/" href="https://two.example.invalid/">x</a>';
    const out = instrumentHtml(html, RECORD, CLICKS, ENV);
    expect(trackedLinks(out).map((link) => link.target)).toEqual(['https://one.example.invalid/']);
    expect(out).toContain('href="https://two.example.invalid/"');
  });

  it('skips comments, an unclosed tag and an unquoted href without damage', () => {
    for (const html of [
      '<!-- <a href="https://a.example.invalid/"> -->',
      '<a href=https://a.example.invalid/ >x</a>',
      '<a href="https://a.example.invalid/',
      '<a title="open',
      '<!-- never closed <a href="https://a.example.invalid/">',
    ]) {
      expect(instrumentHtml(html, RECORD, CLICKS, ENV)).toBe(html);
    }
  });

  it('decodes upper case references and keeps an apostrophe from ending a single-quoted attribute', () => {
    const upper = instrumentHtml(
      '<a href="https://shop.example.invalid/?a=1&AMP;b=2">x</a>',
      RECORD,
      CLICKS,
      ENV
    );
    expect(trackedLinks(upper)[0]!.target).toBe('https://shop.example.invalid/?a=1&b=2');

    const quoted = instrumentHtml(
      "<a href='https://shop.example.invalid/it&apos;s'>x</a>",
      RECORD,
      CLICKS,
      ENV
    );
    // Only the attribute's own two quotes remain; the apostrophe in the address is percent-encoded.
    expect(quoted.split("'")).toHaveLength(3);
    const link = trackedLinks(quoted)[0]!;
    expect(link.target).toBe("https://shop.example.invalid/it's");
    expect(isValidSignature('c', RECORD, link.signature, link.target)).toBe(true);
  });

  it.each([
    ['an unknown name', 'https://shop.example.invalid/?a=1&hellip;b=2'],
    ['a long name', 'https://shop.example.invalid/?a=1&CounterClockwiseContourIntegral;b=2'],
    ['a numeric reference without its semicolon', 'https://shop.example.invalid/?q=&#65'],
    ['a hex reference without its semicolon', 'https://shop.example.invalid/?q=&#x41'],
    ['an impossible code point', 'https://shop.example.invalid/?q=&#0;'],
    ['a code point a browser remaps (0x80)', 'https://shop.example.invalid/?q=&#128;'],
    ['a mixed-case name HTML does not define', 'https://shop.example.invalid/?a=1&Amp;b=2'],
    ['a numeric reference followed by letters', 'https://shop.example.invalid/&#65foo;'],
    ['a named reference without its semicolon', 'https://shop.example.invalid/one&amp'],
    ['a named reference without its semicolon, mid-link', 'https://shop.example.invalid/?a&b'],
  ])('leaves a link as written when it holds %s', (_name, href) => {
    const html = `<a href="${href}">x</a>`;
    expect(instrumentHtml(html, RECORD, CLICKS, ENV)).toBe(html);
  });

  it('treats a bare ampersand before anything else as the literal character', () => {
    const out = instrumentHtml(
      '<a href="https://shop.example.invalid/?a=1&b=2&">x</a>',
      RECORD,
      CLICKS,
      ENV
    );
    expect(trackedLinks(out)[0]!.target).toBe('https://shop.example.invalid/?a=1&b=2&');
  });

  it('keeps a character that is not an ASCII space, such as a no-break space, in the destination', () => {
    const out = instrumentHtml(
      '<a href="https://shop.example.invalid/report\u00a0">x</a>',
      RECORD,
      CLICKS,
      ENV
    );
    expect(trackedLinks(out)[0]!.target).toBe('https://shop.example.invalid/report%C2%A0');
  });

  it('never reads an anchor out of another tag attribute, or out of script, style, title or textarea content', () => {
    for (const html of [
      `<span title='<a href="https://a.example.invalid/">'>x</span>`,
      '<script>var s = \'<a href="https://a.example.invalid/">\';</script>',
      '<style>/* <a href="https://a.example.invalid/"> */</style>',
      '<title><a href="https://a.example.invalid/"></title>',
      '<textarea><a href="https://a.example.invalid/"></textarea>',
    ]) {
      expect(instrumentHtml(html, RECORD, CLICKS, ENV)).toBe(html);
    }
    // A real anchor after such an element is still tracked.
    const after = instrumentHtml(
      '<style>a{}</style><a href="https://shop.example.invalid/">x</a>',
      RECORD,
      CLICKS,
      ENV
    );
    expect(trackedLinks(after)).toHaveLength(1);
  });
  it('keeps every index right when a character changes length in lower case', () => {
    const html = 'İİİ <a href="https://shop.example.invalid/a">x</a>';
    const out = instrumentHtml(html, RECORD, CLICKS, ENV);
    expect(out.startsWith('İİİ <a href="https://api.example.invalid/t/c/')).toBe(true);
    expect(out.endsWith('">x</a>')).toBe(true);
  });

  it('leaves text, comments, styles, other attributes and other tags alone', () => {
    const html =
      'Use href="https://a.example.invalid/1" in text. <!-- href="https://b.example.invalid/2" -->' +
      '<link href="https://c.example.invalid/3"> <style>a{background:url(x)} a[href="https://d.example.invalid/4"]{}</style> ' +
      '<span data-href="https://e.example.invalid/5">s</span> <a href=https://f.example.invalid/6>unquoted</a>';
    expect(instrumentHtml(html, RECORD, CLICKS, ENV)).toBe(html);
  });

  it('does not wrap a link that is already one of ours (a reply quoting a tracked mail)', () => {
    const once = instrumentHtml(
      '<a href="https://shop.example.invalid/a">x</a>',
      RECORD,
      CLICKS,
      ENV
    );
    expect(instrumentHtml(once, RECORD, CLICKS, ENV)).toBe(once);
  });

  it('leaves an invalid or non-http address as it was', () => {
    const html =
      '<a href="http://">x</a> <a href="ftp://f.example.invalid/x">y</a> <a href="javascript:void(0)">z</a>';
    expect(instrumentHtml(html, RECORD, CLICKS, ENV)).toBe(html);
  });

  it('puts the pixel before the closing body tag, whatever its case', () => {
    const out = instrumentHtml(
      '<body>Hi</body>',
      RECORD,
      { trackOpens: true, trackClicks: false },
      ENV
    );
    expect(out.indexOf('<img')).toBeLessThan(out.lastIndexOf('</body>'));
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
