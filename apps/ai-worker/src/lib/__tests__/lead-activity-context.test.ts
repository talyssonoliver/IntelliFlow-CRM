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

  it('reads only the job tenant, and only type, title, date and metadata', async () => {
    const prisma = {
      lead: { findFirst: vi.fn().mockResolvedValue(LEAD) },
      leadActivity: { findMany: vi.fn().mockResolvedValue(ROWS) },
    };
    await loadLeadActivityContext(prisma, 'lead-1', 'tenant-1');
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { id: 'lead-1', tenantId: 'tenant-1' },
      select: { status: true, lastContactedAt: true },
    });
    expect(prisma.leadActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leadId: 'lead-1', tenantId: 'tenant-1' },
        orderBy: { timestamp: 'desc' },
        select: { type: true, title: true, timestamp: true, metadata: true },
      })
    );
  });

  it('gives no context when the history cannot be read, so scoring still runs', async () => {
    const failing = {
      lead: { findFirst: vi.fn().mockRejectedValue(new Error('db down')) },
      leadActivity: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await expect(loadLeadActivityContext(failing, 'l', 't')).resolves.toBeUndefined();
    const missing = {
      lead: { findFirst: vi.fn().mockResolvedValue(null) },
      leadActivity: { findMany: vi.fn().mockResolvedValue([]) },
    };
    await expect(loadLeadActivityContext(missing, 'l', 't')).resolves.toBeUndefined();
  });
});
