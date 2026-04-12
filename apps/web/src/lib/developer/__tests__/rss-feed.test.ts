import { describe, it, expect } from 'vitest';
import {
  buildRssFeed,
  formatRssDate,
  escapeXml,
  type ChangelogEntry,
  type RssFeedOptions,
} from '../rss-feed';

const sampleEntries: ChangelogEntry[] = [
  {
    version: '0.3.0',
    date: '2026-02-01',
    title: 'Breaking API Changes',
    changes: [
      { type: 'breaking', description: 'Removed legacy auth endpoint' },
      { type: 'feature', description: 'Added OAuth 2.0 support' },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-01-15',
    title: 'Performance Release',
    changes: [
      { type: 'performance', description: 'Reduced query latency by 40%' },
      { type: 'fix', description: 'Fixed pagination offset bug' },
    ],
  },
];

const defaultOptions: RssFeedOptions = {
  baseUrl: 'https://example.com',
  title: 'Test Changelog',
  description: 'Test description',
  entries: sampleEntries,
};

describe('buildRssFeed', () => {
  it('returns non-empty string', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result.length).toBeGreaterThan(0);
  });

  it('starts with <?xml declaration', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result).toMatch(/^<\?xml/);
  });

  it('contains <rss version="2.0"> root element', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result).toContain('<rss version="2.0"');
  });

  it('contains <channel> with <title>, <link>, <description>', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result).toContain('<channel>');
    expect(result).toContain('<title>Test Changelog</title>');
    expect(result).toContain('<link>https://example.com/docs/changelog</link>');
    expect(result).toContain('<description>Test description</description>');
  });

  it('contains <atom:link> self-reference', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result).toContain('atom:link');
    expect(result).toContain('rel="self"');
    expect(result).toContain('type="application/rss+xml"');
  });

  it('each entry produces an <item> element', () => {
    const result = buildRssFeed(defaultOptions);
    const itemCount = (result.match(/<item>/g) || []).length;
    expect(itemCount).toBe(2);
  });

  it('each <item> has <title> matching version string', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result).toContain('v0.3.0');
    expect(result).toContain('v0.2.0');
  });

  it('each <item> has <pubDate> in RFC 822 format', () => {
    const result = buildRssFeed(defaultOptions);
    const pubDates = result.match(/<pubDate>(.*?)<\/pubDate>/g) || [];
    expect(pubDates.length).toBe(2);
    for (const pd of pubDates) {
      const dateStr = pd.replace(/<\/?pubDate>/g, '');
      expect(dateStr).toMatch(/^\w{3}, \d{2} \w{3} \d{4}/);
    }
  });

  it('each <item> has <description> with change items', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result).toContain('Removed legacy auth endpoint');
    expect(result).toContain('Reduced query latency');
  });

  it('breaking change entries have [BREAKING] prefix in item title', () => {
    const result = buildRssFeed(defaultOptions);
    expect(result).toContain('[BREAKING] v0.3.0');
    // v0.2.0 has no breaking changes
    expect(result).not.toContain('[BREAKING] v0.2.0');
  });

  it('<guid> per item is unique and includes version slug', () => {
    const result = buildRssFeed(defaultOptions);
    const guids = result.match(/<guid[^>]*>(.*?)<\/guid>/g) || [];
    expect(guids.length).toBe(2);
    const guidValues = guids.map((g) => g.replace(/<[^>]+>/g, ''));
    expect(new Set(guidValues).size).toBe(2);
    expect(guidValues[0]).toContain('v0.3.0');
    expect(guidValues[1]).toContain('v0.2.0');
  });

  it('empty entries array produces valid RSS with no <item> elements', () => {
    const result = buildRssFeed({ ...defaultOptions, entries: [] });
    expect(result).toContain('<?xml');
    expect(result).toContain('<rss version="2.0"');
    expect(result).toContain('<channel>');
    expect(result).not.toContain('<item>');
  });
});

describe('formatRssDate', () => {
  it('converts ISO 8601 to RFC 822 format', () => {
    const result = formatRssDate('2026-02-01');
    expect(result).toMatch(/^\w{3}, \d{2} \w{3} \d{4}/);
    expect(result).toContain('2026');
  });
});

describe('escapeXml', () => {
  it('escapes & to &amp;', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes < to &lt;', () => {
    expect(escapeXml('a < b')).toBe('a &lt; b');
  });

  it('escapes > to &gt;', () => {
    expect(escapeXml('a > b')).toBe('a &gt; b');
  });

  it('escapes " to &quot;', () => {
    expect(escapeXml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it("escapes ' to &apos;", () => {
    expect(escapeXml("it's")).toBe('it&apos;s');
  });
});
