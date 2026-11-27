// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  EMAIL_FRAME_SANDBOX,
  buildEmailFrame,
  referencedContentIds,
  resolveContentIds,
} from '../email-frame';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('EMAIL_FRAME_SANDBOX', () => {
  it('gives the frame no scripts and no same-origin, and no forms or top navigation', () => {
    const flags = EMAIL_FRAME_SANDBOX.split(/\s+/);
    expect(flags).not.toContain('allow-scripts');
    expect(flags).not.toContain('allow-same-origin');
    expect(flags).not.toContain('allow-forms');
    expect(flags).not.toContain('allow-top-navigation');
    expect(flags).not.toContain('allow-top-navigation-by-user-activation');
    expect(flags).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox']);
  });
});

describe('buildEmailFrame', () => {
  it('carries a CSP that loads nothing but images, and blocks other sites by default', () => {
    const { srcDoc } = buildEmailFrame({ html: '<p>Hi</p>', showRemoteImages: false });
    expect(srcDoc).toContain("default-src 'none'");
    expect(srcDoc).toContain('img-src data:;');
    expect(srcDoc).not.toContain('img-src data: https:');
    expect(srcDoc).toContain("base-uri 'none'");
    expect(srcDoc).toContain("form-action 'none'");
    expect(srcDoc).not.toMatch(/script-src/);
  });

  it('allows https images in the CSP only once the user chose to show them', () => {
    const { srcDoc } = buildEmailFrame({ html: '<p>Hi</p>', showRemoteImages: true });
    expect(srcDoc).toContain('img-src data: https:;');
  });

  it('strips scripts, handlers, styles blocks, forms, frames and javascript: links again on the client', () => {
    const { srcDoc } = buildEmailFrame({
      html:
        '<p onclick="x()">Hi</p><script>alert(1)</script><style>p{background:url(https://t.example.invalid/x)}</style>' +
        '<form action="https://evil.example.invalid"><input></form><iframe src="https://evil.example.invalid"></iframe>' +
        '<a href="javascript:alert(1)">bad</a><svg onload="x()"></svg>',
      showRemoteImages: true,
    });
    const body = srcDoc.slice(srcDoc.indexOf('<body>'));
    expect(body).not.toMatch(/script|onclick|<form|<input|<iframe|javascript:|<svg|t\.example/i);
    expect(body).toContain('Hi');
  });

  it('blocks external images by default and counts them, and shows them when asked', () => {
    const html =
      '<img src="https://cdn.example.invalid/a.png" width="100"><img src="https://cdn.example.invalid/b.png" width="100">';
    const blocked = buildEmailFrame({ html, showRemoteImages: false });
    expect(blocked.blockedImageCount).toBe(2);
    expect(blocked.srcDoc).not.toContain('cdn.example.invalid');
    const shown = buildEmailFrame({ html, showRemoteImages: true });
    expect(shown.blockedImageCount).toBe(0);
    expect(shown.srcDoc).toContain('https://cdn.example.invalid/a.png');
  });

  it('a hidden image takes no space: no broken icon, no bordered box, no reserved height', () => {
    const html =
      '<p>Before</p><img src="https://cdn.example.invalid/hero.png" width="600" height="200" alt="Hero"><p>After</p>';
    const blocked = buildEmailFrame({ html, showRemoteImages: false });
    expect(blocked.srcDoc).not.toContain('<img');
    const body = blocked.srcDoc.slice(blocked.srcDoc.indexOf('<body>'));
    expect(body).not.toMatch(/height[:=]/i);
    expect(body).not.toMatch(/\sborder\s*[:=]/i);
    expect(blocked.srcDoc).toContain('<p>Before</p><p>After</p>');
    expect(blocked.blockedImageCount).toBe(1);
    // Shown, the image is there (a small layout shift is accepted).
    const shown = buildEmailFrame({ html, showRemoteImages: true });
    expect(shown.srcDoc).toContain('<img');
    expect(shown.blockedImageCount).toBe(0);
  });

  it('an unresolved cid: takes no space either', () => {
    const { srcDoc } = buildEmailFrame({
      html: '<p>a</p><img src="cid:gone" width="40" height="400"><p>b</p>',
      showRemoteImages: false,
    });
    expect(srcDoc).not.toContain('<img');
    expect(srcDoc.slice(srcDoc.indexOf('<body>'))).not.toMatch(/height[:=]/i);
    expect(srcDoc).toContain('<p>a</p><p>b</p>');
  });

  it('puts the fetched inline image where its cid: was, and leaves an unfetched one blank', () => {
    const html = '<img src="cid:Logo%40mail" alt="a"><img src="cid:other" alt="b">';
    const { srcDoc, blockedImageCount } = buildEmailFrame({
      html,
      showRemoteImages: false,
      inlineImages: { 'Logo@mail': PNG },
    });
    expect(srcDoc).toContain(PNG);
    expect(srcDoc).not.toContain('cid:');
    expect(blockedImageCount).toBe(0);
  });

  it('never keeps SVG or other data: images, even as an inline image', () => {
    const { srcDoc } = buildEmailFrame({
      html: '<img src="data:image/svg+xml;base64,PHN2Zz4="><img src="cid:x">',
      showRemoteImages: true,
      inlineImages: { x: 'data:image/svg+xml;base64,PHN2Zz4=' },
    });
    expect(srcDoc).not.toContain('svg');
  });

  it('opens image-map links in a new tab too, so none navigates the frame', () => {
    const { srcDoc } = buildEmailFrame({
      html: '<map name="m"><area href="https://example.invalid" shape="rect" coords="0,0,9,9"></map>',
      showRemoteImages: false,
    });
    expect(srcDoc).toContain('target="_blank"');
  });

  it('opens every link in a new tab with noopener', () => {
    const { srcDoc } = buildEmailFrame({
      html: '<a href="https://example.invalid">go</a>',
      showRemoteImages: false,
    });
    expect(srcDoc).toContain('target="_blank"');
    expect(srcDoc).toContain('rel="noopener noreferrer nofollow"');
  });
});

describe('referencedContentIds', () => {
  it('finds a cid in an unquoted src too, and resolves it', () => {
    expect(referencedContentIds('<img src=cid:logo><img src = "cid:b">')).toEqual(['logo', 'b']);
    const { srcDoc } = buildEmailFrame({
      html: '<img src=cid:logo alt="x">',
      showRemoteImages: false,
      inlineImages: { logo: PNG },
    });
    expect(srcDoc).toContain(PNG);
  });

  it('changes only src values: text that looks like a cid src is left as written', () => {
    const { srcDoc } = buildEmailFrame({
      html: '<p>Write src=cid:Logo@mail in your template</p><img src="cid:Logo@mail">',
      showRemoteImages: false,
      inlineImages: { 'Logo@mail': PNG },
    });
    expect(srcDoc).toContain('Write src=cid:Logo@mail in your template');
    expect(srcDoc).toContain(PNG);
  });

  it('reads an HTML-escaped Content-ID as the id it names', () => {
    expect(referencedContentIds('<img src="cid:A&amp;B@mail">')).toEqual(['A&B@mail']);
    const { srcDoc } = buildEmailFrame({
      html: '<img src="cid:A&amp;B@mail">',
      showRemoteImages: false,
      inlineImages: { 'A&B@mail': PNG },
    });
    expect(srcDoc).toContain(PNG);
    // A srcset naming a cid is dropped, never resolved or left to load.
    const dropped = buildEmailFrame({
      html: '<img src="cid:a" srcset="cid:a 1x, cid:b 2x">',
      showRemoteImages: true,
      inlineImages: { a: PNG },
    }).srcDoc;
    expect(dropped).not.toContain('srcset');
    expect(dropped).not.toContain('cid:');
  });

  it('keeps the case of a Content-ID, so ids that differ only by case stay different images', () => {
    expect(referencedContentIds('<img src="cid:Logo"><img src="cid:logo">')).toEqual([
      'Logo',
      'logo',
    ]);
    const { srcDoc } = buildEmailFrame({
      html: '<img src="cid:Logo"><img src="cid:logo">',
      showRemoteImages: false,
      inlineImages: { Logo: PNG, logo: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
    });
    expect(srcDoc).toContain(PNG);
    expect(srcDoc).toContain('R0lGODlh');
    // A body naming __proto__ never reads from the object's prototype.
    expect(
      buildEmailFrame({ html: '<img src="cid:__proto__">', showRemoteImages: false }).srcDoc
    ).not.toContain('object');
  });

  it('matches an attachment id exactly, else by case only when exactly one fits', () => {
    const html =
      '<img src="cid:Logo"><img src="cid:banner"><img src="cid:dup"><img src="cid:none">';
    expect(resolveContentIds(html, ['Logo', 'Banner', 'DUP', 'dup', 'logo'])).toEqual({
      Logo: 'Logo',
      banner: 'Banner',
      dup: 'dup',
    });
    expect(resolveContentIds('<img src="cid:x">', ['X', 'x'])).toEqual({ x: 'x' });
    expect(resolveContentIds('<img src="cid:ab">', ['AB', 'Ab'])).toEqual({});
  });

  it('lists the cids the body names, decoded, once each', () => {
    expect(
      referencedContentIds(
        '<img src="cid:A%40b"><img src=\'cid:c\'><img src="cid:c"><img src="https://x">'
      )
    ).toEqual(['A@b', 'c']);
  });
});
