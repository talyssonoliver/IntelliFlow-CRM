import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActivityIcon,
  getActivityIconBg,
  formatRelativeTime,
  formatEstimatedValue,
  formatGBPCompact,
  httpUrlOrNull,
  insightRecommendations,
  isSystemTag,
  isTouchpoint,
  isTrackedEmailSend,
  leadActivityMetrics,
  leadWebsite,
  openRateLabel,
  visibleTags,
  leadDisplayName,
  leadExportFields,
  type ActivityType,
} from '../lead-format';

describe('lead-format · profile card metrics (#1288)', () => {
  it('counts only emails the CRM tracks opens for as sends', () => {
    expect(isTrackedEmailSend({ type: 'email', metadata: { opened: false } })).toBe(true);
    expect(isTrackedEmailSend({ type: 'email', metadata: { openCount: 0 } })).toBe(true);
    // A logged or synced email (outreach send, inbound reply) has no tracking.
    expect(isTrackedEmailSend({ type: 'email', metadata: { subject: 'Hi' } as never })).toBe(false);
    expect(isTrackedEmailSend({ type: 'email', metadata: null })).toBe(false);
    expect(isTrackedEmailSend({ type: 'email' })).toBe(false);
    expect(isTrackedEmailSend({ type: 'call', metadata: { opened: true } })).toBe(false);
  });

  it('leaves score and status changes out of touchpoints', () => {
    expect(isTouchpoint('score_update')).toBe(false);
    expect(isTouchpoint('status_change')).toBe(false);
    for (const type of ['email', 'call', 'note', 'meeting', 'web_form', 'qualification'] as const) {
      expect(isTouchpoint(type)).toBe(true);
    }
  });

  it('counts tracked sends, opens, meetings and touchpoints from activities', () => {
    expect(
      leadActivityMetrics([
        { type: 'email', metadata: { opened: true } },
        { type: 'email', metadata: { openCount: 2 } },
        { type: 'email', metadata: { opened: false, openCount: 0 } },
        { type: 'email', metadata: {} },
        { type: 'meeting' },
        { type: 'score_update' },
        { type: 'status_change' },
      ])
    ).toEqual({ emailsSent: 3, emailsOpened: 2, meetings: 1, touchpoints: 5 });
    expect(leadActivityMetrics([])).toEqual({
      emailsSent: 0,
      emailsOpened: 0,
      meetings: 0,
      touchpoints: 0,
    });
  });

  it('shows a dash with no tracked sends, and a percentage once there are some', () => {
    expect(openRateLabel(0, 0)).toBe('—');
    expect(openRateLabel(3, 0)).toBe('0%');
    expect(openRateLabel(3, 1)).toBe('33%');
    expect(openRateLabel(4, 4)).toBe('100%');
  });
});

const ALL_TYPES: ActivityType[] = [
  'web_form',
  'score_update',
  'email',
  'call',
  'note',
  'meeting',
  'status_change',
  'qualification',
];

describe('lead-format · getActivityIcon', () => {
  it('maps every activity type to its material-symbol icon', () => {
    const expected: Record<ActivityType, string> = {
      web_form: 'web',
      score_update: 'psychology',
      email: 'mail',
      call: 'call',
      note: 'edit_note',
      meeting: 'event',
      status_change: 'person_add',
      qualification: 'verified',
    };
    for (const type of ALL_TYPES) {
      expect(getActivityIcon(type)).toBe(expected[type]);
    }
  });
});

describe('lead-format · getActivityIconBg', () => {
  it('returns background + text classes for every activity type', () => {
    for (const type of ALL_TYPES) {
      const cls = getActivityIconBg(type);
      expect(cls).toContain('bg-');
      expect(cls).toContain('text-');
      expect(cls).toContain('dark:');
    }
  });
});

describe('lead-format · formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders minutes for under an hour', () => {
    expect(formatRelativeTime('2026-06-13T11:30:00.000Z')).toBe('30m ago');
  });

  it('renders hours for under a day', () => {
    expect(formatRelativeTime('2026-06-13T08:00:00.000Z')).toBe('4h ago');
  });

  it('renders "Yesterday" at one day', () => {
    expect(formatRelativeTime('2026-06-12T10:00:00.000Z')).toBe('Yesterday');
  });

  it('renders "N days ago" within the week', () => {
    expect(formatRelativeTime('2026-06-10T12:00:00.000Z')).toBe('3 days ago');
  });

  it('renders a localised date for a week or older', () => {
    const out = formatRelativeTime('2026-05-01T12:00:00.000Z', 'Europe/London');
    expect(out).toContain('2026');
    expect(out).toContain('May');
  });
});

describe('lead-format · formatEstimatedValue', () => {
  it('formats values >= £1,000 as compact thousands (pence in)', () => {
    expect(formatEstimatedValue(5_000_000)).toBe('£50k');
    expect(formatEstimatedValue(100_000_000)).toBe('£1000k');
  });

  it('formats sub-£1,000 values as whole pounds (no 100x error)', () => {
    expect(formatEstimatedValue(50_000)).toBe('£500');
    expect(formatEstimatedValue(99_900)).toBe('£999');
  });

  it('formats zero', () => {
    expect(formatEstimatedValue(0)).toBe('£0');
  });
});

describe('lead-format · leadDisplayName', () => {
  it('uses first and last name when present', () => {
    expect(
      leadDisplayName({
        firstName: 'Ada',
        lastName: 'Lovelace',
        company: 'Acme',
        email: 'a@example.invalid',
      })
    ).toBe('Ada Lovelace');
  });

  it('uses a single name part without stray spaces', () => {
    expect(leadDisplayName({ firstName: ' Ada ', lastName: '', company: 'Acme' })).toBe('Ada');
    expect(leadDisplayName({ firstName: null, lastName: 'Lovelace' })).toBe('Lovelace');
  });

  it('falls back to the company when there is no name', () => {
    expect(
      leadDisplayName({
        firstName: '',
        lastName: '  ',
        company: 'Acme Ltd',
        email: 'a@example.invalid',
      })
    ).toBe('Acme Ltd');
  });

  it('falls back to the email when there is no name or company', () => {
    expect(
      leadDisplayName({ firstName: null, lastName: null, company: '', email: 'a@example.invalid' })
    ).toBe('a@example.invalid');
  });

  it('never returns an empty string', () => {
    expect(leadDisplayName({})).toBe('Unnamed lead');
  });
});

describe('lead-format · formatGBPCompact (UI-017)', () => {
  it('uses pounds, never dollars', () => {
    expect(formatGBPCompact(50_000)).toBe('£50k');
    expect(formatGBPCompact(999)).toBe('£999');
    expect(formatGBPCompact(0)).toBe('£0');
  });
});

describe('lead-format · system tags (UI-017)', () => {
  it('recognises the COA sync bookkeeping tags', () => {
    expect(isSystemTag('coa-pipeline')).toBe(true);
    expect(isSystemTag('coa-lead:abc123')).toBe(true);
    expect(isSystemTag('vip')).toBe(false);
    expect(isSystemTag('coa-pipeline-old')).toBe(false);
    expect(isSystemTag('my-coa-lead:1')).toBe(false);
  });

  it('keeps only the user tags, in order', () => {
    expect(visibleTags(['vip', 'coa-pipeline', 'coa-lead:1', 'restaurant'])).toEqual([
      'vip',
      'restaurant',
    ]);
    expect(visibleTags([])).toEqual([]);
  });
});

describe('lead-format · formatGBPCompact rounding', () => {
  it('rounds before choosing the compact form', () => {
    expect(formatGBPCompact(999.5)).toBe('£1k');
    expect(formatGBPCompact(999.4)).toBe('£999');
    expect(formatEstimatedValue(99_950)).toBe('£1k');
  });
});

describe('lead-format · leadWebsite (#1277)', () => {
  it('shows the bare host for an ad-tracking URL and drops the tracking parameters', () => {
    expect(
      leadWebsite('http://www.energym.co.uk/?utm_source=google&utm_medium=wix_google&gclid=abc')
    ).toEqual({ href: 'http://www.energym.co.uk/', label: 'energym.co.uk' });
  });

  it('adds https to a bare domain and keeps a real path and real parameters', () => {
    expect(leadWebsite('example.invalid')).toEqual({
      href: 'https://example.invalid/',
      label: 'example.invalid',
    });
    expect(leadWebsite('https://www.example.invalid/shop/?page=2&utm_campaign=x')).toEqual({
      href: 'https://www.example.invalid/shop/?page=2',
      label: 'example.invalid/shop',
    });
  });

  it('returns null when there is no usable http(s) address', () => {
    expect(leadWebsite('')).toBeNull();
    expect(leadWebsite('   ')).toBeNull();
    expect(leadWebsite(null)).toBeNull();
    expect(leadWebsite(undefined)).toBeNull();
    expect(leadWebsite('javascript:alert(1)')).toBeNull();
    expect(leadWebsite('ftp://files.example.invalid')).toBeNull();
    expect(leadWebsite('http://')).toBeNull();
  });

  it('returns null for placeholder words that are not addresses', () => {
    expect(leadWebsite('N/A')).toBeNull();
    expect(leadWebsite('none')).toBeNull();
    expect(leadWebsite('unknown')).toBeNull();
  });

  it('returns null for placeholders the URL parser would rewrite into hosts', () => {
    expect(leadWebsite('0')).toBeNull();
    expect(leadWebsite('1234')).toBeNull();
    expect(leadWebsite('n.a.')).toBeNull();
    expect(leadWebsite('N.A.')).toBeNull();
    expect(leadWebsite('none.')).toBeNull();
    expect(leadWebsite('1.2')).toBeNull();
    expect(leadWebsite('https://.example.invalid')).toBeNull();
  });

  it('keeps an IP address', () => {
    expect(leadWebsite('http://192.0.2.10/')?.label).toBe('192.0.2.10');
    expect(leadWebsite('192.0.2.10:8080')?.label).toBe('192.0.2.10');
    expect(leadWebsite('http://[2001:db8::1]/')?.label).toBe('[2001:db8::1]');
    expect(leadWebsite('http://[2001:db8::1]:8443/x')?.label).toBe('[2001:db8::1]/x');
  });

  it('keeps a domain with a port, user info or a non-Latin top-level label', () => {
    expect(leadWebsite('shop.example.invalid:8080/a')?.label).toBe('shop.example.invalid/a');
    expect(leadWebsite('https://user@shop.example.invalid')?.label).toBe('shop.example.invalid');
    expect(leadWebsite('café.example.invalid')?.label).toBe('café.example.invalid');
    expect(leadWebsite('例え.テスト')?.label).toBe('例え.テスト');
  });

  it('shows a non-ASCII path readably and keeps the encoded href', () => {
    const site = leadWebsite('https://WWW.Example.invalid/menú/');
    expect(site?.label).toBe('example.invalid/menú');
    expect(site?.href).toBe('https://www.example.invalid/men%C3%BA/');
    expect(leadWebsite('https://example.invalid/%E0%A4%A')?.label).toBe('example.invalid/%E0%A4%A');
  });

  it('labels the host the link opens when a backslash comes before an @', () => {
    const site = leadWebsite('https://a.example.invalid\\@b.example.invalid');
    expect(site?.href).toBe('https://a.example.invalid/@b.example.invalid');
    expect(site?.label).toBe('a.example.invalid/@b.example.invalid');
  });

  it('keeps control and bidi characters in a path encoded in the label', () => {
    expect(leadWebsite('https://shop.example.invalid/%E2%80%AEtxt.evil')?.label).toBe(
      'shop.example.invalid/%E2%80%AEtxt.evil'
    );
    expect(leadWebsite('https://shop.example.invalid/a%0Ab')?.label).toBe(
      'shop.example.invalid/a%0Ab'
    );
  });

  it('keeps the remaining parameters exactly as stored', () => {
    expect(leadWebsite('https://shop.example.invalid/?q=a%20b&utm_source=g')?.href).toBe(
      'https://shop.example.invalid/?q=a%20b'
    );
    expect(leadWebsite('https://shop.example.invalid/?preview&gclid=1')?.href).toBe(
      'https://shop.example.invalid/?preview'
    );
    expect(leadWebsite('https://shop.example.invalid/?a=b+c')?.href).toBe(
      'https://shop.example.invalid/?a=b+c'
    );
  });
});

describe('lead-format · insightRecommendations', () => {
  it('reads a plain list of texts', () => {
    expect(insightRecommendations(['Call back', 'Send proposal'])).toEqual([
      'Call back',
      'Send proposal',
    ]);
  });

  it('reads the texts of the object shape the intelligence router writes', () => {
    expect(
      insightRecommendations({
        texts: ['Follow up this week'],
        emotions: ['joy'],
        keyPhrases: ['pricing'],
        primaryEmotion: 'joy',
      })
    ).toEqual(['Follow up this week']);
  });

  it('drops non-text entries and reads anything else as none', () => {
    expect(insightRecommendations(['ok', 3, null, { a: 1 }])).toEqual(['ok']);
    expect(insightRecommendations({ texts: 'not a list' })).toEqual([]);
    expect(insightRecommendations(null)).toEqual([]);
    expect(insightRecommendations(undefined)).toEqual([]);
    expect(insightRecommendations('text')).toEqual([]);
  });
});

describe('httpUrlOrNull', () => {
  it('keeps absolute http and https addresses', () => {
    expect(httpUrlOrNull('https://files.example.invalid/a.pdf')).toBe(
      'https://files.example.invalid/a.pdf'
    );
    expect(httpUrlOrNull('http://files.example.invalid/a.pdf')).toBe(
      'http://files.example.invalid/a.pdf'
    );
  });

  it('rejects missing, relative and non-http addresses', () => {
    expect(httpUrlOrNull(undefined)).toBeNull();
    expect(httpUrlOrNull(null)).toBeNull();
    expect(httpUrlOrNull('')).toBeNull();
    expect(httpUrlOrNull('/files/a.pdf')).toBeNull();
    expect(httpUrlOrNull('javascript:alert(1)')).toBeNull();
    expect(httpUrlOrNull('data:text/html,hi')).toBeNull();
  });
});

describe('lead-format · leadExportFields', () => {
  it('writes the stored fields with no display fallbacks', () => {
    expect(
      leadExportFields({
        id: 'lead-1',
        firstName: 'Ada',
        lastName: null,
        email: 'ada@example.invalid',
        phone: null,
        company: 'Analytical Engines',
        title: undefined,
        location: null,
        website: 'example.invalid',
        status: 'NEW',
        source: 'WEBSITE',
        score: 0,
        estimatedValue: 5_000_000,
        owner: { name: 'Grace' },
        createdAt: '2026-11-01T09:00:00.000Z',
        lastContactedAt: null,
      })
    ).toEqual({
      id: 'lead-1',
      firstName: 'Ada',
      lastName: '',
      email: 'ada@example.invalid',
      phone: '',
      company: 'Analytical Engines',
      title: '',
      location: '',
      website: 'example.invalid',
      status: 'NEW',
      source: 'WEBSITE',
      score: 0,
      estimatedValuePence: 5_000_000,
      owner: 'Grace',
      createdAt: '2026-11-01T09:00:00.000Z',
      lastContactedAt: '',
    });
  });

  it('leaves out an unreadable date and a missing owner or value', () => {
    const fields = leadExportFields({
      id: 'lead-2',
      email: 'b@example.invalid',
      status: 'NEW',
      source: 'OTHER',
      score: 10,
      createdAt: 'not a date',
      lastContactedAt: new Date('2026-11-02T10:00:00.000Z'),
    });
    expect(fields.createdAt).toBe('');
    expect(fields.lastContactedAt).toBe('2026-11-02T10:00:00.000Z');
    expect(fields.owner).toBe('');
    expect(fields.estimatedValuePence).toBe('');
  });
});
