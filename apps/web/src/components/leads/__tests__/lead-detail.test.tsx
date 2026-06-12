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
  estimatedValue: 50000,
  emailsSent: 10,
  emailsOpened: 5,
  meetings: 2,
  touchpoints: 7,
};

describe('LeadDetail', () => {
  it('renders identity and contact details (AC-001)', () => {
    render(<LeadDetail lead={makeLead()} leadMetrics={metrics} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('CTO')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('+1 555-0101')).toBeInTheDocument();
    expect(screen.getByText('London, UK')).toBeInTheDocument();
    expect(screen.getByText('acme.com')).toBeInTheDocument();
    expect(screen.getByText('enterprise')).toBeInTheDocument();
  });

  it('renders status + temperature badges and the owner card', () => {
    render(<LeadDetail lead={makeLead()} leadMetrics={metrics} />);
    expect(screen.getByText('New Lead')).toBeInTheDocument();
    expect(screen.getByText('Hot')).toBeInTheDocument();
    expect(screen.getByText('Alex Owner')).toBeInTheDocument();
    expect(screen.getByText('Sales Representative')).toBeInTheDocument();
  });

  it('renders key metrics (est. value, score, open rate, touchpoints)', () => {
    render(<LeadDetail lead={makeLead()} leadMetrics={metrics} />);
    expect(screen.getByText('$50k')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
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

  it('SourceBadge renders the human label for a source', () => {
    render(<SourceBadge source="COLD_CALL" />);
    expect(screen.getByText('Cold Call')).toBeInTheDocument();
  });

  it('TemperatureBadge renders the temperature label', () => {
    render(<TemperatureBadge temperature="warm" />);
    expect(screen.getByText('Warm')).toBeInTheDocument();
  });
});
