/**
 * The engagement history the scoring prompt gets, for a synthetic lead shaped like the one
 * that scored 0 at confidence 0.05 (seven logged emails, two replies asking for the price).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  activityDirection,
  buildLeadActivityContext,
  formatLeadActivityContext,
  loadLeadActivityContext,
  type ActivityRow,
} from '../lead-activity-context';

const NOW = new Date('2026-11-07T17:00:00Z');
const at = (iso: string) => new Date(iso);

/** Newest first, as the query orders them. */
const ROWS: ActivityRow[] = [
  {
    type: 'SCORE_UPDATE',
    title: 'Score updated',
    timestamp: at('2026-11-07T16:05:00Z'),
    metadata: {},
  },
  {
    type: 'EMAIL',
    title: 'Price follow-up sent',
    timestamp: at('2026-11-06T10:00:00Z'),
    metadata: {},
  },
  {
    type: 'EMAIL',
    title: 'Reply received: how much would the site cost?',
    timestamp: at('2026-11-05T15:20:00Z'),
    metadata: {},
  },
  {
    type: 'EMAIL',
    title: 'Follow-up email sent',
    timestamp: at('2026-11-04T09:00:00Z'),
    metadata: {},
  },
  {
    type: 'NOTE',
    title: 'Stage moved to Replied',
    timestamp: at('2026-11-04T08:00:00Z'),
    metadata: {
      source: 'coa-pipeline-sync',
      coaStage: 'RESPONDED',
      stageChangedAt: '2026-11-03T18:00:00Z',
      coaLeadId: 'coa-1',
    },
  },
  {
    type: 'EMAIL',
    title: 'Reply received: send me the price please',
    timestamp: at('2026-11-03T17:45:00Z'),
    metadata: {},
  },
  { type: 'EMAIL', title: 'Email sent', timestamp: at('2026-10-30T09:00:00Z'), metadata: {} },
  {
    type: 'EMAIL',
    title: 'Follow-up email sent',
    timestamp: at('2026-10-27T09:00:00Z'),
    metadata: {},
  },
  {
    type: 'EMAIL',
    title: 'Outreach email sent',
    timestamp: at('2026-10-20T09:00:00Z'),
    metadata: {},
  },
];

const LEAD = { status: 'CONTACTED', lastContactedAt: at('2026-11-06T10:00:00Z') };

describe('lead activity context for scoring', () => {
  it('builds the prompt lines for a lead that replied twice asking for the price', () => {
    const lines = formatLeadActivityContext(buildLeadActivityContext(LEAD, ROWS), NOW);
    expect(lines).toBe(
      [
        'Lead Status: CONTACTED',
        'Last Contacted: 2026-11-06 (1 day ago)',
        'Pipeline Stage: RESPONDED (since 2026-11-03)',
        'Engagement: 5 emails sent to the lead, 2 replies from the lead, 0 calls, 0 meetings',
        'Recent Activity (newest first):',
        '- 2026-11-06 EMAIL outbound: Price follow-up sent',
        '- 2026-11-05 EMAIL inbound: Reply received: how much would the site cost?',
        '- 2026-11-04 EMAIL outbound: Follow-up email sent',
        '- 2026-11-04 NOTE: Stage moved to Replied',
        '- 2026-11-03 EMAIL inbound: Reply received: send me the price please',
        '- 2026-10-30 EMAIL outbound: Email sent',
        '- 2026-10-27 EMAIL outbound: Follow-up email sent',
        '- 2026-10-20 EMAIL outbound: Outreach email sent',
      ].join('\n')
    );
  });

  it('uses a stored direction first, and infers one only for an EMAIL without it', () => {
    const row = (type: string, title: string, metadata: unknown = {}): ActivityRow => ({
      type,
      title,
      timestamp: NOW,
      metadata,
    });
    expect(activityDirection(row('EMAIL', 'Pricing', { direction: 'inbound' }))).toBe('inbound');
    expect(activityDirection(row('EMAIL', 'Reply received: hi'))).toBe('inbound');
    expect(activityDirection(row('EMAIL', 'Email sent'))).toBe('outbound');
    expect(activityDirection(row('CALL', 'Call', { direction: 'inbound' }))).toBe('inbound');
    expect(activityDirection(row('CALL', 'Call'))).toBeNull();
    expect(activityDirection(row('EMAIL', 'Reply received', { direction: 'sideways' }))).toBe(
      'inbound'
    );
    expect(activityDirection(row('EMAIL', 'Received email: pricing please'))).toBe('inbound');
    expect(activityDirection(row('EMAIL', 'Price follow-up sent'))).toBe('outbound');
    // Neither word: not guessed.
    expect(activityDirection(row('EMAIL', 'Pricing question'))).toBeNull();
    // Only the event part counts, never the words after it.
    expect(activityDirection(row('EMAIL', 'Email sent: please reply with your availability'))).toBe(
      'outbound'
    );
    expect(activityDirection(row('EMAIL', 'Reply received: I sent you the brief'))).toBe('inbound');
    // An event that says both is not guessed either.
    expect(activityDirection(row('EMAIL', 'Reply sent'))).toBeNull();
  });

  it('counts an email whose direction is unclear apart, instead of as sent', () => {
    const context = buildLeadActivityContext(LEAD, [
      { type: 'EMAIL', title: 'Pricing question', timestamp: NOW, metadata: {} },
      { type: 'EMAIL', title: 'Email sent', timestamp: NOW, metadata: {} },
    ]);
    expect(formatLeadActivityContext(context, NOW)).toContain(
      'Engagement: 1 emails sent to the lead, 0 replies from the lead, 1 emails of unknown direction, 0 calls, 0 meetings'
    );
  });

  it('never carries metadata values other than the pipeline stage, and caps titles', () => {
    const long = 'x'.repeat(500);
    const context = buildLeadActivityContext(LEAD, [
      { type: 'NOTE', title: long, timestamp: NOW, metadata: { secret: 'pat@example.invalid' } },
    ]);
    const lines = formatLeadActivityContext(context, NOW);
    expect(lines).not.toContain('pat@example.invalid');
    expect(lines).toContain(`NOTE: ${'x'.repeat(120)}`);
    expect(lines).not.toContain('x'.repeat(121));
  });

  it('names the scope when the counts stop at the safety cap', () => {
    const context = buildLeadActivityContext(LEAD, [], { countRows: [], countsCapped: true });
    expect(formatLeadActivityContext(context, NOW)).toContain(
      'Engagement (latest 5000 emails, calls and meetings only):'
    );
  });

  it('says so when there is no history', () => {
    const lines = formatLeadActivityContext(
      buildLeadActivityContext({ status: 'NEW', lastContactedAt: null }, []),
      NOW
    );
    expect(lines).toBe(
      [
        'Lead Status: NEW',
        'Last Contacted: never',
        'Engagement: 0 emails sent to the lead, 0 replies from the lead, 0 calls, 0 meetings',
        'Recent Activity: none recorded',
      ].join('\n')
    );
  });

  it('reads only the job tenant, leaves score updates out before the limit, and reads the stage apart', async () => {
    const stageNote = ROWS.find((row) => row.type === 'NOTE')!;
    const oldReply: ActivityRow = {
      type: 'EMAIL',
      title: 'Reply received: still interested',
      timestamp: at('2025-01-10T09:00:00Z'),
      metadata: {},
    };
    const prisma = {
      lead: { findFirst: vi.fn().mockResolvedValue(LEAD) },
      leadActivity: {
        findMany: vi
          .fn()
          // The listed window: newer notes only, so the old reply and the stage are not in it.
          .mockResolvedValueOnce(
            Array.from({ length: 15 }, () => ({
              type: 'NOTE',
              title: 'Note',
              timestamp: NOW,
              metadata: {},
            }))
          )
          // The counted history: every email, call and meeting, however old.
          .mockResolvedValueOnce([oldReply]),
        findFirst: vi.fn().mockResolvedValue(stageNote),
      },
    };
    const context = await loadLeadActivityContext(prisma, 'lead-1', 'tenant-1');
    expect(context?.pipelineStage?.stage).toBe('RESPONDED');
    // The old reply still counts, though it is outside the listed window.
    expect(context?.counts.replies).toBe(1);
    expect(context?.countsCapped).toBe(false);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { id: 'lead-1', tenantId: 'tenant-1' },
      select: expect.objectContaining({
        status: true,
        lastContactedAt: true,
        email: true,
        budget: true,
        need: true,
      }),
    });
    const select = { type: true, title: true, timestamp: true, metadata: true };
    expect(prisma.leadActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leadId: 'lead-1', tenantId: 'tenant-1', type: { not: 'SCORE_UPDATE' } },
        orderBy: { timestamp: 'desc' },
        take: 15,
        select,
      })
    );
    expect(prisma.leadActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          leadId: 'lead-1',
          tenantId: 'tenant-1',
          type: { in: ['EMAIL', 'CALL', 'MEETING'] },
        },
        select,
      })
    );
    expect(prisma.leadActivity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadId: 'lead-1', tenantId: 'tenant-1', type: 'NOTE' }),
        select,
      })
    );
  });

  it('gives no context when the history cannot be read, so scoring still runs', async () => {
    const failing = {
      lead: { findFirst: vi.fn().mockRejectedValue(new Error('db down')) },
      leadActivity: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    };
    await expect(loadLeadActivityContext(failing, 'l', 't')).resolves.toBeUndefined();
    const missing = {
      lead: { findFirst: vi.fn().mockResolvedValue(null) },
      leadActivity: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    };
    await expect(loadLeadActivityContext(missing, 'l', 't')).resolves.toBeUndefined();
  });

  it('adds the enquiry data, email tracking and note count when the lead has them', () => {
    const context = buildLeadActivityContext(
      {
        ...LEAD,
        budget: 'around 3000 pounds',
        need: 'a booking site for the studio',
        timeline: 'short',
        annualRevenue: null,
        utmSource: 'google',
        referrer: 'https://www.example.invalid/some/path?q=1',
        landingPath: '/pilates?token=abc',
        outreachSlug: 'pilates-living',
        tags: ['studio', 'london'],
      },
      [],
      {
        emailTracking: {
          sent: 3,
          opened: 2,
          clicked: 1,
          openEvents: 5,
          clickEvents: 1,
          lastOpenedAt: at('2026-11-06T10:00:00Z'),
          lastClickedAt: null,
          received: 1,
        },
        noteCount: 2,
      }
    );
    const lines = formatLeadActivityContext(context, NOW);
    expect(lines).toContain(
      'Email Tracking: 3 tracked emails sent, 2 opened (5 opens, most recent mail first opened 2026-11-06 (1 day ago)), 1 with a link clicked (1 clicks)'
    );
    expect(lines).toContain('Emails Received From The Lead (mailbox sync): 1');
    expect(lines).toContain('Notes: 2 written by the team');
    expect(lines).toContain('Stated Budget: around 3000 pounds');
    expect(lines).toContain('Stated Timeline: short');
    expect(lines).toContain('Arrived Via Campaign: google');
    // Only the host of the referrer and the path of the landing page, never a query string.
    expect(lines).toContain('Referrer: www.example.invalid');
    expect(lines).toContain('Landing Page: /pilates');
    expect(lines).not.toContain('token=abc');
    expect(lines).toContain('Outreach Concept Page: pilates-living');
    expect(lines).toContain('Tags: studio, london');
  });

  it('reads email tracking and the note count through the optional readers', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      {
        sent: 2,
        opened: 1,
        clicked: 0,
        open_events: 3,
        click_events: 0,
        last_opened_at: '2026-11-06T10:00:00Z',
        last_clicked_at: null,
        received: 0,
      },
    ]);
    const prisma = {
      lead: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...LEAD, email: 'pat@example.invalid', need: 'new site' }),
      },
      leadActivity: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
      leadNote: { count: vi.fn().mockResolvedValue(4) },
      $queryRaw: queryRaw,
    };
    const context = await loadLeadActivityContext(prisma, 'lead-1', 'tenant-1');
    expect(context?.emailTracking).toMatchObject({ sent: 2, opened: 1, openEvents: 3 });
    expect(context?.noteCount).toBe(4);
    expect(context?.enquiry).toContain('Stated Need: new site');
    expect(prisma.leadNote.count).toHaveBeenCalledWith({
      where: { leadId: 'lead-1', tenantId: 'tenant-1' },
    });
  });

  it('still scores when the extra reads fail', async () => {
    const prisma = {
      lead: { findFirst: vi.fn().mockResolvedValue({ ...LEAD, email: 'pat@example.invalid' }) },
      leadActivity: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
      leadNote: { count: vi.fn().mockRejectedValue(new Error('x')) },
      $queryRaw: vi.fn().mockRejectedValue(new Error('x')),
    };
    const context = await loadLeadActivityContext(prisma, 'l', 't');
    expect(context?.emailTracking).toBeNull();
    expect(context?.noteCount).toBe(0);
  });
});
