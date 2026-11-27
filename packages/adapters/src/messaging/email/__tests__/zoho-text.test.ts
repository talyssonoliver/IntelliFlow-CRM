import { describe, it, expect } from 'vitest';
import { displayName, zohoAddresses, zohoBodyText } from '../zoho-text';
// The two parsers stay part of the reader module's API.
import {
  zohoAddresses as readerAddresses,
  zohoBodyText as readerBodyText,
} from '../zoho-mail-reader';

describe('zohoAddresses', () => {
  it('reads every address, whatever the format', () => {
    expect(zohoAddresses('"Ada" &lt;Ada@Example.invalid&gt;, bob@example.invalid; nobody')).toEqual(
      ['ada@example.invalid', 'bob@example.invalid']
    );
    expect(zohoAddresses(undefined)).toEqual([]);
  });

  it('is still exported by the reader module', () => {
    expect(readerAddresses).toBe(zohoAddresses);
    expect(readerBodyText).toBe(zohoBodyText);
  });

  it('keeps an apostrophe inside an address, and drops quotes around one', () => {
    expect(zohoAddresses("O'Neil &lt;o'neil@example.invalid&gt;")).toEqual([
      "o'neil@example.invalid",
    ]);
    expect(zohoAddresses("'ada@example.invalid'")).toEqual(['ada@example.invalid']);
  });

  it('takes the address in angle brackets, never one written in the display name', () => {
    expect(
      zohoAddresses('"ceo@lead.example.invalid" &lt;someone@other.example.invalid&gt;')
    ).toEqual(['someone@other.example.invalid']);
    expect(
      zohoAddresses(
        '"Lee, ceo@lead.example.invalid" &lt;lee@example.invalid&gt;, bo@example.invalid'
      )
    ).toEqual(['lee@example.invalid', 'bo@example.invalid']);
  });

  it('keeps the recipients after a display name with one unmatched quote', () => {
    expect(
      zohoAddresses('"Lee &lt;lee@example.invalid&gt;, bo@example.invalid; cy@example.invalid')
    ).toEqual(['lee@example.invalid', 'bo@example.invalid', 'cy@example.invalid']);
    // Balanced quotes still protect a comma inside a name.
    expect(zohoAddresses('"Lee, Ann" &lt;ann@example.invalid&gt;, bo@example.invalid')).toEqual([
      'ann@example.invalid',
      'bo@example.invalid',
    ]);
  });

  it('decodes the entities Zoho escapes, so an encoded apostrophe stays in the address', () => {
    expect(zohoAddresses('O&#39;Neil &lt;o&#39;neil@example.invalid&gt;')).toEqual([
      "o'neil@example.invalid",
    ]);
  });
});

describe('displayName', () => {
  it('decodes the same entities as the body text', () => {
    expect(displayName('Smith &amp; Co &lt;sales@example.invalid&gt;')).toBe('Smith & Co');
    expect(displayName('&quot;O&#39;Neil&quot; &lt;o@example.invalid&gt;')).toBe("O'Neil");
  });

  it('reads a literal "&lt;" in a name as text, never as markup', () => {
    expect(displayName('a &amp;lt; b &lt;x@example.invalid&gt;')).toBe('a &lt; b');
  });

  it('is null without a name', () => {
    expect(displayName('rebecca@example.invalid')).toBeNull();
    expect(displayName(undefined)).toBeNull();
  });
});

describe('zohoBodyText', () => {
  it('turns HTML into text and cuts it', () => {
    expect(zohoBodyText('<style>x{}</style><div>Hello</div><div>world</div>', 100)).toBe(
      'Hello\nworld'
    );
    expect(zohoBodyText('<p>abcdef</p>', 3)).toBe('abc');
  });

  it('keeps a "<" that starts no tag, and skips script and style in any case', () => {
    expect(zohoBodyText('price < 100, call me', 100)).toBe('price < 100, call me');
    expect(zohoBodyText('<p>a < b</p><p>c</p>', 100)).toBe('a < b\nc');
    expect(zohoBodyText('<STYLE>x{}</Style>Hi', 100)).toBe('Hi');
  });

  it('decodes the common entities, with &amp; last', () => {
    expect(
      zohoBodyText('<p>Smith &amp; Co&nbsp;said &quot;it&#39;s &amp;lt;ok&amp;gt;&quot;</p>', 100)
    ).toBe('Smith & Co said "it\'s &lt;ok&gt;"');
  });
});
