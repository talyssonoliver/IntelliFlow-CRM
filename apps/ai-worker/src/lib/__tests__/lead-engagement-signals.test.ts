import { describe, it, expect, vi } from 'vitest';
import {
  addressPattern,
  emailTrackingLines,
  enquiryLines,
  loadEmailTracking,
} from '../lead-engagement-signals';
import { buildLeadActivityContext, formatLeadActivityContext } from '../lead-activity-context';

const NO_MAIL = {
  sent: 0,
  opened: 0,
  clicked: 0,
  openEvents: 0,
  clickEvents: 0,
  lastOpenedAt: null,
  lastClickedAt: null,
  received: 0,
};

describe('lead engagement signals', () => {
  it('writes nothing for a lead with no enquiry data or email records', () => {
    expect(enquiryLines({ budget: ' ', timeline: 'unknown', tags: [] })).toEqual([]);
    expect(enquiryLines(null)).toEqual([]);
    expect(emailTrackingLines(NO_MAIL, new Date())).toEqual([]);
    expect(emailTrackingLines(null, new Date())).toEqual([]);
  });

  it('shows a deal estimate in pounds from pence', () => {
    expect(enquiryLines({ estimatedValue: 250000 })).toEqual(['Estimated Deal Value: £2500']);
  });

  it('keeps sent mail that nobody opened as evidence, not as missing data', () => {
    expect(emailTrackingLines({ ...NO_MAIL, sent: 4 }, new Date())).toEqual([
      'Email Tracking: 4 tracked emails sent, 0 opened (0 opens), 0 with a link clicked (0 clicks)',
    ]);
  });

  it('reports mail received from the lead on its own', () => {
    expect(emailTrackingLines({ ...NO_MAIL, received: 2 }, new Date())).toEqual([
      'Emails Received From The Lead (mailbox sync): 2',
    ]);
  });

  it('reduces the referrer to its host and the landing page to its path', () => {
    const lines = enquiryLines({
      referrer: 'https://www.example.invalid/a/b?token=abc',
      landingPath: '/pilates?token=abc#x',
    });
    expect(lines).toEqual(['Referrer: www.example.invalid', 'Landing Page: /pilates']);
  });

  it('escapes regex characters in the address pattern', () => {
    expect(addressPattern('a.b+c@example.invalid')).toBe(
      String.raw`(^|[\s,;<])a\.b\+c@example\.invalid($|[\s,;>])`
    );
  });

  it('maps the tracking row, including bigint counts and dates as text', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        sent: 3n,
        opened: 2n,
        clicked: 1n,
        open_events: 5n,
        click_events: 1n,
        last_opened_at: '2026-11-06T10:00:00Z',
        last_clicked_at: null,
        received: 0n,
      },
    ]);
    const tracking = await loadEmailTracking(
      { $queryRaw: queryRaw },
      'tenant-1',
      ' Pat@Example.invalid '
    );
    expect(tracking).toEqual({
      sent: 3,
      opened: 2,
      clicked: 1,
      openEvents: 5,
      clickEvents: 1,
      lastOpenedAt: new Date('2026-11-06T10:00:00Z'),
      lastClickedAt: null,
      received: 0,
    });
    // The tenant and the lowered address are bound as parameters, never joined into the SQL.
    const values = queryRaw.mock.calls[0]!.slice(1);
    expect(values[0]).toBe('tenant-1');
    expect(values).toContain('pat@example.invalid');
  });

  it('gives nothing when the query returns no row', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    await expect(
      loadEmailTracking({ $queryRaw: queryRaw }, 't', 'a@b.invalid')
    ).resolves.toBeUndefined();
  });

  it('keeps the whole prompt within the 8000 characters the scoring chain accepts', () => {
    const long = 'x'.repeat(5000);
    const context = buildLeadActivityContext(
      {
        status: 'NEW',
        lastContactedAt: null,
        budget: long,
        need: long,
        authority: long,
        landingPath: `/${long}`,
        referrer: `https://${long}.invalid/`,
        tags: Array.from({ length: 50 }, () => long),
      },
      Array.from({ length: 40 }, (_, i) => ({
        type: 'NOTE',
        title: long,
        timestamp: new Date(1_700_000_000_000 + i),
        metadata: {},
      }))
    );
    expect(formatLeadActivityContext(context, new Date()).length).toBeLessThanOrEqual(8000);
  });
});
