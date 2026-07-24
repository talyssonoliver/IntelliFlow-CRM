/**
 * Unit tests for contact-360.tsx (PG-065 reconcile).
 *
 * These cover the presentational scaffolding and pure transforms extracted from
 * the Contact 360 route (apps/web/src/app/contacts/[id]/page.tsx). The route
 * previously had no dedicated unit tests for these units (page-registry:
 * "Unit Tests: None"); this locks their behavior in place after the extraction.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  mapSentiment,
  ContactStatusBadge,
  getStageColor,
  getActivityIcon,
  getActivityIconBg,
  getSentimentColor,
  getChannelIcon,
  getCallOutcomeStyle,
  getCallOutcomeLabel,
  getTicketStatusStyle,
  getPriorityStyle,
  getSentimentTrendStyle,
  getSentimentEmoji,
  renderRichPreview,
  ContactLoadingSkeleton,
  ContactAuthRedirect,
  ContactNotFoundError,
  transformFeedToActivities,
  transformContactForUI,
  filterContactActivities,
  type Activity,
  type ContactWithRelations,
  type ContactStatus,
} from '../contact-360';

describe('contact-360 — pure helpers', () => {
  it('mapSentiment maps DB values and returns undefined for null/unknown', () => {
    expect(mapSentiment('POSITIVE')).toBe('positive');
    expect(mapSentiment('NEUTRAL')).toBe('neutral');
    expect(mapSentiment('NEGATIVE')).toBe('negative');
    expect(mapSentiment(null)).toBeUndefined();
    expect(mapSentiment('UNKNOWN')).toBeUndefined();
  });

  it('getStageColor covers each stage + default', () => {
    for (const stage of ['Closed Won', 'Closed Lost', 'Negotiation', 'Proposal', 'Prospecting']) {
      expect(typeof getStageColor(stage)).toBe('string');
    }
    expect(getStageColor('Closed Won')).not.toBe(getStageColor('Closed Lost'));
  });

  it('getActivityIcon returns a node for every activity type', () => {
    for (const t of [
      'email',
      'call',
      'meeting',
      'chat',
      'document',
      'deal',
      'ticket',
      'note',
    ] as const) {
      expect(getActivityIcon(t)).toBeTruthy();
      expect(typeof getActivityIconBg(t)).toBe('string');
    }
  });

  it('getSentimentColor / getSentimentEmoji cover positive/negative/default', () => {
    expect(getSentimentColor('positive')).toContain('green');
    expect(getSentimentColor('negative')).toContain('red');
    expect(getSentimentColor(undefined)).toContain('slate');
    expect(getSentimentEmoji('positive')).not.toBe(getSentimentEmoji('negative'));
    expect(getSentimentEmoji(undefined)).toBeTruthy();
  });

  it('getChannelIcon covers whatsapp/teams/slack/default', () => {
    for (const c of ['whatsapp', 'teams', 'slack', undefined]) {
      expect(getChannelIcon(c as string)).toBeTruthy();
    }
  });

  it('getCallOutcome{Style,Label} cover connected/voicemail/default', () => {
    for (const o of ['connected', 'voicemail', 'no-answer']) {
      expect(typeof getCallOutcomeStyle(o)).toBe('string');
      expect(typeof getCallOutcomeLabel(o)).toBe('string');
    }
    expect(getCallOutcomeStyle('connected')).not.toBe(getCallOutcomeStyle('voicemail'));
  });

  it('getTicketStatusStyle / getPriorityStyle / getSentimentTrendStyle cover branches', () => {
    for (const s of ['Resolved', 'Open', 'Pending'])
      expect(typeof getTicketStatusStyle(s)).toBe('string');
    for (const p of ['High', 'Medium', 'Low']) expect(typeof getPriorityStyle(p)).toBe('string');
    for (const t of ['improving', 'declining', 'stable'])
      expect(typeof getSentimentTrendStyle(t)).toBe('string');
  });
});

const baseActivity = (over: Partial<Activity>): Activity => ({
  id: 'a1',
  type: 'email',
  title: 'Sent proposal',
  description: 'desc',
  timestamp: '2026-01-01T00:00:00.000Z',
  user: 'Alice',
  ...over,
});

describe('contact-360 — renderRichPreview', () => {
  it('returns null when there is no metadata', () => {
    expect(renderRichPreview(baseActivity({ metadata: undefined }))).toBeNull();
  });

  it('renders a preview for each rich activity type', () => {
    const cases: Array<[Activity['type'], Activity['metadata']]> = [
      ['email', { subject: 'Hi', preview: 'body', openCount: 3 }],
      ['call', { outcome: 'connected', duration: '5m' }],
      ['meeting', { location: 'Room 1', duration: '30m', attendees: ['Bob'], notes: 'n' }],
      ['chat', { channel: 'slack', messageCount: 4, preview: 'yo' }],
      ['document', { fileName: 'f.pdf', fileSize: '1MB' }],
      ['ticket', { ticketId: 'T-1', status: 'Open', priority: 'High' }],
    ];
    for (const [type, metadata] of cases) {
      const { container, unmount } = render(
        <div>{renderRichPreview(baseActivity({ type, metadata }))}</div>
      );
      expect(container.textContent).toBeTruthy();
      unmount();
    }
  });

  it('returns null for a type without a rich renderer (note)', () => {
    expect(
      renderRichPreview(baseActivity({ type: 'note', metadata: { subject: 'x' } }))
    ).toBeNull();
  });
});

describe('contact-360 — components', () => {
  it('ContactStatusBadge renders a label for every status + fallback', () => {
    const statuses: ContactStatus[] = [
      'ACTIVE',
      'INACTIVE',
      'ARCHIVED',
      'PROSPECT',
      'CUSTOMER',
      'FORMER_CUSTOMER',
    ];
    for (const status of statuses) {
      const { unmount } = render(<ContactStatusBadge status={status} />);
      unmount();
    }
    render(<ContactStatusBadge status={'WEIRD' as ContactStatus} />);
    expect(screen.getByText('WEIRD')).toBeInTheDocument();
  });

  it('loading / auth-redirect / not-found screens render', () => {
    const a = render(<ContactLoadingSkeleton />);
    a.unmount();
    const b = render(<ContactAuthRedirect />);
    expect(b.container.textContent).toMatch(/redirect/i);
    b.unmount();
    render(<ContactNotFoundError fromInsight={false} />);
    expect(screen.getByText(/Contact Not Found/i)).toBeInTheDocument();
  });

  it('ContactNotFoundError shows the stale-insight variant', () => {
    render(<ContactNotFoundError fromInsight />);
    expect(screen.getByText(/Stale Insight/i)).toBeInTheDocument();
  });
});

describe('contact-360 — transforms', () => {
  it('transformFeedToActivities maps feed items and defaults the actor', () => {
    const out = transformFeedToActivities([
      { id: 'f1', type: 'EMAIL', title: 'T', timestamp: '2026-01-01T00:00:00.000Z' },
      {
        id: 'f2',
        type: 'CALL',
        title: 'C',
        description: 'd',
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
        actor: { name: 'Bob' },
        metadata: { sentiment: 'positive' },
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].type).toBe('email');
    expect(out[0].user).toBe('System');
    expect(out[1].user).toBe('Bob');
    expect(out[1].sentiment).toBe('positive');
  });

  const apiContact = (over: Partial<ContactWithRelations> = {}): ContactWithRelations => ({
    id: 'c1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '123',
    title: 'CTO',
    department: 'Eng',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    ...over,
  });

  it('transformContactForUI maps a fully-populated contact', () => {
    const ui = transformContactForUI(
      apiContact({
        account: { id: 'acc1', name: 'Acme', industry: 'Tech', website: 'acme.com' },
        owner: { id: 'o1', name: 'Rep', email: 'rep@example.com', avatarUrl: null },
        opportunities: [
          {
            id: 'op1',
            name: 'Deal',
            value: 5000,
            stage: 'Proposal',
            probability: 0.5,
            closeDate: null,
          },
        ],
        tasks: [{ id: 't1', title: 'Task', dueDate: null, priority: 'High', status: 'OPEN' }],
        activities: [
          {
            id: 'ac1',
            type: 'EMAIL',
            title: 'e',
            description: null,
            timestamp: '2026-01-01T00:00:00.000Z',
            userName: 'x',
            metadata: null,
            sentiment: null,
          },
        ],
      })
    );
    expect(ui.company).toBe('Acme');
    expect(ui.owner.name).toBe('Rep');
    expect(ui.metrics.totalDeals).toBe(1);
    expect(ui.metrics.totalValue).toBe(5000);
    expect(ui.hasActiveDeal).toBe(true);
  });

  it('transformContactForUI handles a contact with no account/owner/relations', () => {
    const ui = transformContactForUI(
      apiContact({ firstName: null, lastName: null, account: null })
    );
    expect(ui.company).toBe('');
    expect(ui.owner.name).toBe('Unassigned');
    expect(ui.account).toBeNull();
    expect(ui.metrics.totalDeals).toBe(0);
    expect(ui.hasActiveDeal).toBe(false);
  });

  it('filterContactActivities filters by type, person, and search query', () => {
    const acts: Activity[] = [
      baseActivity({ id: '1', type: 'email', title: 'Quarterly report', user: 'Alice' }),
      baseActivity({ id: '2', type: 'call', title: 'Intro call', user: 'Bob' }),
    ];
    expect(filterContactActivities(acts, 'email', 'all', '')).toHaveLength(1);
    expect(filterContactActivities(acts, 'all', 'Bob', '')).toHaveLength(1);
    expect(filterContactActivities(acts, 'all', 'all', 'quarterly')).toHaveLength(1);
    expect(filterContactActivities(acts, 'all', 'all', 'nomatch')).toHaveLength(0);
    expect(filterContactActivities(acts, 'all', 'all', '')).toHaveLength(2);
  });
});
