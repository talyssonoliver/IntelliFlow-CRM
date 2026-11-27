/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/components/shared/app-avatar', () => ({
  // Render no findable text so identity/owner names assert uniquely.
  AppAvatar: ({ name }: Readonly<{ name?: string }>) => (
    <div data-testid="app-avatar" aria-label={name} />
  ),
}));

vi.mock('@/components/shared/entity-hover-card', () => ({
  EntityHoverCard: ({ children }: Readonly<{ children: React.ReactNode }>) => <>{children}</>,
}));

import {
  LeadDetail,
  LeadStatusBadge,
  SourceBadge,
  TemperatureBadge,
  type LeadProfileData,
  type LeadMetrics,
} from '../lead-detail';

function makeLead(overrides: Partial<LeadProfileData> = {}): LeadProfileData {
  return {
    id: 'lead-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1 555-0101',
    company: 'Acme Corp',
    title: 'CTO',
    location: 'London, UK',
    website: 'acme.com',
    status: 'NEW',
    source: 'WEBSITE',
    score: 75,
    temperature: 'hot',
    createdAt: '2026-03-01T00:00:00.000Z',
    lastContactedAt: '2026-03-02T00:00:00.000Z',
    avatarUrl: '',
    estimatedValue: 50000,
    tags: ['enterprise'],
    owner: { name: 'Alex Owner', title: 'Sales Representative', avatarUrl: '' },
    accountId: null,
    account: null,
    ...overrides,
  };
}

const metrics: LeadMetrics = {
  estimatedValue: 5_000_000, // pence -> £50,000 -> "£50k"
  emailsSent: 10,
  emailsOpened: 5,
  meetings: 2,
  touchpoints: 7,
};

describe('LeadDetail', () => {
  it('shows a lead named after its company once: the company line is hidden when it repeats the name', () => {
    render(
      <LeadDetail
        lead={makeLead({ firstName: '', lastName: '', company: 'Acme Handyman Ltd' })}
        leadMetrics={metrics}
      />
    );
    expect(screen.getAllByText('Acme Handyman Ltd')).toHaveLength(1);
  });

  it('keeps the way to the account when the company repeats the name: the name is the link', () => {
    render(
      <LeadDetail
        lead={makeLead({
          firstName: '',
          lastName: '',
          company: 'Acme Handyman Ltd',
          accountId: 'acc-1',
          account: { id: 'acc-1', name: 'Acme Handyman Ltd' },
        })}
        leadMetrics={metrics}
      />
    );
    const links = screen.getAllByRole('link', { name: 'Acme Handyman Ltd' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/accounts/acc-1');
    expect(screen.getAllByText('Acme Handyman Ltd')).toHaveLength(1);
  });

  it('links the company line to the account when the name is a person', () => {
    render(
      <LeadDetail
        lead={makeLead({
          company: 'Acme Corp',
          accountId: 'acc-2',
          account: { id: 'acc-2', name: 'Acme Corp' },
        })}
        leadMetrics={metrics}
      />
    );
    expect(screen.getByRole('link', { name: 'Acme Corp' })).toHaveAttribute(
      'href',
      '/accounts/acc-2'
    );
    expect(screen.getByRole('heading', { level: 2, name: 'John Doe' })).toBeInTheDocument();
  });

  it('matches the company to the name ignoring case and spaces', () => {
    render(
      <LeadDetail
        lead={makeLead({ firstName: 'Pilates', lastName: 'Living', company: ' pilates  LIVING ' })}
        leadMetrics={metrics}
      />
    );
    expect(screen.getAllByText(/pilates\s+living/i)).toHaveLength(1);
  });

  it('keeps the company line when it differs from the name', () => {
    render(<LeadDetail lead={makeLead()} leadMetrics={metrics} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });
  it('renders identity and contact details (AC-001)', () => {
    render(<LeadDetail lead={makeLead()} leadMetrics={metrics} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('CTO')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('+1 555-0101')).toBeInTheDocument();
    // Once in the Location row and once on the map card (pin plus the address, with a real link).
    expect(screen.getAllByText('London, UK')).toHaveLength(2);
    expect(screen.getByText('acme.com')).toBeInTheDocument();
    expect(screen.getByText('enterprise')).toBeInTheDocument();
  });

  it('shows a tracking-URL website as its clean host, linked without tracking (#1277)', () => {
    render(
      <LeadDetail
        lead={makeLead({
          website:
            'http://www.northfield-fitness.example.invalid/?utm_source=google&utm_medium=wix',
        })}
        leadMetrics={metrics}
      />
    );
    const link = screen.getByRole('link', {
      name: 'northfield-fitness.example.invalid (opens in new tab)',
    });
    expect(link).toHaveTextContent('northfield-fitness.example.invalid');
    expect(link).toHaveAttribute('href', 'http://www.northfield-fitness.example.invalid/');
  });

  it('offers "Add value", not "£0", for a lead with no estimated value (#1277, MVP-003)', () => {
    render(<LeadDetail lead={makeLead()} leadMetrics={{ ...metrics, estimatedValue: 0 }} />);
    expect(screen.queryByText('£0')).not.toBeInTheDocument();
    // The link opens the edit form, which focuses the value field from this hash.
    expect(screen.getByRole('link', { name: 'Add value' })).toHaveAttribute(
      'href',
      '/leads/lead-1/edit#estimatedValue'
    );
  });

  it('shows no website row when the lead has none (#1277)', () => {
    render(<LeadDetail lead={makeLead({ website: '' })} leadMetrics={metrics} />);
    expect(screen.queryByText('Website')).not.toBeInTheDocument();
  });

  it('hides the COA sync system tags and keeps the user tags (UI-017)', () => {
    render(
      <LeadDetail
        lead={makeLead({ tags: ['enterprise', 'coa-pipeline', 'coa-lead:abc123'] })}
        leadMetrics={metrics}
      />
    );
    expect(screen.getByText('enterprise')).toBeInTheDocument();
    expect(screen.queryByText('coa-pipeline')).not.toBeInTheDocument();
    expect(screen.queryByText('coa-lead:abc123')).not.toBeInTheDocument();
  });

  it('renders status + temperature badges and the owner card', () => {
    render(<LeadDetail lead={makeLead()} leadMetrics={metrics} />);
    expect(screen.getByText('New Lead')).toBeInTheDocument();
    expect(screen.getByText('Hot')).toBeInTheDocument();
    expect(screen.getByText('Alex Owner')).toBeInTheDocument();
    expect(screen.getByText('Sales Representative')).toBeInTheDocument();
  });

  it('renders key metrics (est. value, score, open rate, touchpoints)', () => {
    render(<LeadDetail lead={makeLead({ scoringStatus: 'SCORED' })} leadMetrics={metrics} />);
    expect(screen.getByText('£50k')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('shows a dash for the open rate when no tracked email was sent (#1288)', () => {
    render(
      <LeadDetail lead={makeLead()} leadMetrics={{ ...metrics, emailsSent: 0, emailsOpened: 0 }} />
    );
    expect(screen.getByTestId('lead-open-rate')).toHaveTextContent('—');
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('shows 0% only when tracked emails were sent and none was opened (#1288)', () => {
    render(
      <LeadDetail lead={makeLead()} leadMetrics={{ ...metrics, emailsSent: 3, emailsOpened: 0 }} />
    );
    expect(screen.getByTestId('lead-open-rate')).toHaveTextContent('0%');
  });

  it('shows "Not scored" in the profile card when no real score exists (#1218)', () => {
    render(
      <LeadDetail lead={makeLead({ score: 0, scoringStatus: 'NONE' })} leadMetrics={metrics} />
    );
    const notScored = screen.getByText('Not scored');
    // The card shows the label in place of the stored 0.
    expect(notScored.nextElementSibling?.textContent).toBe('Lead Score');
  });

  it('shows "Few signals yet" in the profile card for a NEEDS_REVIEW lead with unknown confidence', () => {
    render(<LeadDetail lead={makeLead({ scoringStatus: 'NEEDS_REVIEW' })} leadMetrics={metrics} />);
    const flag = screen.getByTitle(/little activity/);
    expect(flag.textContent).toMatch(/^Few signals yet\. This score is based on little activity/);
    expect(flag.parentElement?.textContent).toMatch(/^75Few signals yet/);
  });

  it('shows "Low confidence" only when the stored confidence is below 0.6', () => {
    render(
      <LeadDetail
        lead={makeLead({ scoringStatus: 'NEEDS_REVIEW', scoreConfidence: 0.4 })}
        leadMetrics={metrics}
      />
    );
    expect(screen.getByText('Low confidence')).toBeTruthy();
    expect(screen.queryByText('Few signals yet')).toBeNull();
  });

  it.each([
    [0.59, 'Low confidence', 'Few signals yet'],
    [0.6, 'Few signals yet', 'Low confidence'],
    [0.84, 'Few signals yet', 'Low confidence'],
  ])('shows only the right flag for a stored confidence of %s', (confidence, shown, hidden) => {
    render(
      <LeadDetail
        lead={makeLead({ scoringStatus: 'NEEDS_REVIEW', scoreConfidence: confidence })}
        leadMetrics={metrics}
      />
    );
    expect(screen.getByText(shown, { exact: false })).toBeTruthy();
    expect(screen.queryByText(hidden, { exact: false })).toBeNull();
  });

  it('shows no flag at a stored confidence of 0.85 or more', () => {
    render(
      <LeadDetail
        lead={makeLead({ scoringStatus: 'SCORED', scoreConfidence: 0.85 })}
        leadMetrics={metrics}
      />
    );
    expect(screen.queryByText('Few signals yet', { exact: false })).toBeNull();
    expect(screen.queryByText('Low confidence', { exact: false })).toBeNull();
  });

  it('links the company to its account when accountId is present (IFC-227 parity)', () => {
    render(
      <LeadDetail
        lead={makeLead({ accountId: 'acc-1', account: { id: 'acc-1', name: 'Acme Corp' } })}
        leadMetrics={metrics}
      />
    );
    const link = screen
      .getAllByRole('link', { name: /Acme Corp/i })
      .find((l) => l.getAttribute('href') === '/accounts/acc-1');
    expect(link).toBeDefined();
  });

  it('renders the company as plain text when there is no account', () => {
    render(
      <LeadDetail lead={makeLead({ accountId: null, account: null })} leadMetrics={metrics} />
    );
    const accountLinks = screen
      .queryAllByRole('link', { name: /Acme Corp/i })
      .filter((l) => l.getAttribute('href')?.startsWith('/accounts/'));
    expect(accountLinks).toHaveLength(0);
  });
});

describe('Lead badges', () => {
  it('LeadStatusBadge renders the "Negotiating" label for NEGOTIATING', () => {
    render(<LeadStatusBadge status="NEGOTIATING" />);
    expect(screen.getByText('Negotiating')).toBeInTheDocument();
  });

  it('LeadStatusBadge renders DB-only statuses without crashing (DISQUALIFIED / ARCHIVED)', () => {
    const { rerender } = render(<LeadStatusBadge status="DISQUALIFIED" />);
    expect(screen.getByText('Disqualified')).toBeInTheDocument();
    rerender(<LeadStatusBadge status="ARCHIVED" />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('SourceBadge renders the human label for a source', () => {
    render(<SourceBadge source="COLD_CALL" />);
    expect(screen.getByText('Cold Call')).toBeInTheDocument();
  });

  it('SourceBadge labels leads created by the public booking page (PG-203)', () => {
    render(<SourceBadge source="BOOKING" />);
    expect(screen.getByText('Booking')).toBeInTheDocument();
  });

  it('TemperatureBadge renders the temperature label', () => {
    render(<TemperatureBadge temperature="warm" />);
    expect(screen.getByText('Warm')).toBeInTheDocument();
  });
});

vi.mock('@/lib/format/useTenantCurrency', () => ({ useTenantCurrency: () => 'GBP' }));
