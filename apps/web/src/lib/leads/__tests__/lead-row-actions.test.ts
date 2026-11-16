import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  emailComposeHref,
  formatLeadListDate,
  leadMenuActions,
  leadQuickActions,
  type LeadRowActionHandlers,
} from '../lead-row-actions';
import type { Lead } from '@/lib/leads/lead-types';

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-1',
  email: 'a+b@example.invalid',
  firstName: 'Ann',
  lastName: 'Lee',
  company: 'Acme',
  title: null,
  status: 'NEW',
  score: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

function handlers(): LeadRowActionHandlers {
  return {
    onEdit: vi.fn(),
    onConvert: vi.fn(),
    onQualify: vi.fn(),
    onScore: vi.fn(),
    onToggleStar: vi.fn(),
    onDelete: vi.fn(),
  };
}

const labels = (l: Lead) => leadMenuActions(l, handlers()).map((a) => a.label);

afterEach(() => vi.restoreAllMocks());

describe('emailComposeHref', () => {
  it('encodes the address', () => {
    expect(emailComposeHref('a+b@example.invalid')).toBe(
      '/email/compose?to=a%2Bb%40example.invalid'
    );
  });
});

describe('leadQuickActions', () => {
  it('calls the lead when it has a phone', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    leadQuickActions(lead({ phone: '+440000000000' }))[0].onClick();
    expect(open).toHaveBeenCalledWith('tel:+440000000000');
  });

  it('does nothing on Call without a phone', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    leadQuickActions(lead({ phone: null }))[0].onClick();
    expect(open).not.toHaveBeenCalled();
  });

  it('offers Call then Send Email', () => {
    expect(leadQuickActions(lead()).map((a) => a.label)).toEqual(['Call', 'Send Email']);
  });
});

describe('leadMenuActions', () => {
  it('offers Qualify for NEW and CONTACTED leads, not Convert', () => {
    expect(labels(lead({ status: 'NEW' }))).toContain('Qualify Lead');
    expect(labels(lead({ status: 'CONTACTED' }))).toContain('Qualify Lead');
    expect(labels(lead({ status: 'NEW' }))).not.toContain('Convert to Contact');
  });

  it('offers Convert only for a QUALIFIED lead', () => {
    const l = labels(lead({ status: 'QUALIFIED' }));
    expect(l).toContain('Convert to Contact');
    expect(l).not.toContain('Qualify Lead');
  });

  it('shows Unstar for a starred lead and Star otherwise', () => {
    expect(labels(lead({ isStarred: true }))[0]).toBe('Unstar');
    expect(labels(lead({ isStarred: false }))[0]).toBe('Star');
  });

  it('wires every item to its handler and ends with a separator then Delete', () => {
    const h = handlers();
    const l = lead({ status: 'QUALIFIED' });
    const actions = leadMenuActions(l, h);
    for (const a of actions) a.onClick();
    expect(h.onToggleStar).toHaveBeenCalledWith(l);
    expect(h.onEdit).toHaveBeenCalledWith(l);
    expect(h.onConvert).toHaveBeenCalledWith(l);
    expect(h.onScore).toHaveBeenCalledWith(l);
    expect(h.onDelete).toHaveBeenCalledWith(l);
    expect(actions.at(-2)?.separator).toBe(true);
    expect(actions.at(-1)).toMatchObject({ label: 'Delete', variant: 'danger' });
  });

  it('wires Qualify to its handler', () => {
    const h = handlers();
    const l = lead({ status: 'NEW' });
    leadMenuActions(l, h)
      .find((a) => a.label === 'Qualify Lead')
      ?.onClick();
    expect(h.onQualify).toHaveBeenCalledWith(l);
  });
});

describe('formatLeadListDate', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');

  it('says Just now within the hour', () => {
    expect(formatLeadListDate('2026-03-10T11:30:00.000Z', 'Europe/London', now)).toBe('Just now');
  });

  it('counts hours, then days', () => {
    expect(formatLeadListDate('2026-03-10T11:00:00.000Z', 'Europe/London', now)).toBe('1 hour ago');
    expect(formatLeadListDate('2026-03-10T07:00:00.000Z', 'Europe/London', now)).toBe(
      '5 hours ago'
    );
    expect(formatLeadListDate('2026-03-09T12:00:00.000Z', 'Europe/London', now)).toBe('1 day ago');
    expect(formatLeadListDate(new Date('2026-03-07T12:00:00.000Z'), 'Europe/London', now)).toBe(
      '3 days ago'
    );
  });

  it('shows a short date after a week', () => {
    expect(formatLeadListDate('2026-01-02T10:00:00.000Z', 'Europe/London', now)).toBe('2 Jan 2026');
  });

  it('says Invalid date for a bad value', () => {
    expect(formatLeadListDate('not a date')).toBe('Invalid date');
  });
});
