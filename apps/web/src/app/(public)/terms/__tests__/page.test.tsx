// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Stub server-only so server modules can be imported in jsdom tests
vi.mock('server-only', () => ({}));

// Stub next/link as a plain <a> tag for the test environment
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: Readonly<{ children: React.ReactNode; href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock client module at module level — configurable per test for banner tests
vi.mock('@/lib/legal/acceptance-tracker.client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/legal/acceptance-tracker.client')>();
  return {
    ...actual,
    getStoredAcceptanceRecord: vi.fn(() => null),
  };
});

import TermsPage, { metadata } from '../page';

describe('TermsPage', () => {
  it('renders the page heading and terms summary content', () => {
    render(<TermsPage />);

    expect(
      screen.getByRole('heading', { name: /terms of service/i })
    ).toBeInTheDocument();
    // version badge appears at least once
    expect(screen.getAllByText(/v2026\.08/).length).toBeGreaterThanOrEqual(1);
    // At least one summary bullet from frontmatter
    expect(screen.getByText(/18 or older/i)).toBeInTheDocument();
  });

  it('renders current terms metadata sourced from the helper', () => {
    render(<TermsPage />);

    // version appears in metadata card
    expect(screen.getAllByText(/v2026\.08/).length).toBeGreaterThanOrEqual(1);
    // en-GB formatted date for 2026-08-11
    expect(screen.getByText(/11 august 2026/i)).toBeInTheDocument();

    const emailLinks = screen.getAllByRole('link', {
      name: /legal@intelliflow-crm\.com/i,
    });
    expect(emailLinks.length).toBeGreaterThanOrEqual(1);
    expect(emailLinks[0]).toHaveAttribute('href', 'mailto:legal@intelliflow-crm.com');
  });

  it('renders a main landmark and section navigation links', () => {
    render(<TermsPage />);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');

    expect(
      screen.getByRole('link', { name: /acceptance of terms/i })
    ).toHaveAttribute('href', '#acceptance-of-terms');

    const nav = screen.getByRole('navigation', { name: /terms sections/i });
    expect(nav).toBeInTheDocument();
  });

  it('exports metadata for the canonical terms route', () => {
    expect(String(metadata.title)).toContain('Terms of Service');
    expect(metadata.alternates?.canonical).toBe('/terms');
    expect(metadata.openGraph?.url).toContain('/terms');
  });
});

describe('acceptance-tracker', () => {
  it('getTermsOfService returns parsed sections from content file', async () => {
    const { getTermsOfService } = await import('@/lib/legal/acceptance-tracker');
    const terms = getTermsOfService();

    expect(terms.metadata.title).toBe('Terms of Service');
    expect(terms.sections.length).toBeGreaterThanOrEqual(8);
    expect(terms.sections[0].id).toBe('acceptance-of-terms');
    expect(terms.sections[0].body.length).toBeGreaterThanOrEqual(1);
  });

  it('formatTermsDate formats ISO dates in en-GB locale', async () => {
    const { formatTermsDate } = await import('@/lib/legal/acceptance-tracker');
    const result = formatTermsDate('2026-08-11');

    expect(result).toMatch(/\d+/);
    expect(result).toMatch(/2026/);
  });

  it('buildTermsAcceptanceRecord returns a valid acceptance record', async () => {
    const { buildTermsAcceptanceRecord } = await import(
      '@/lib/legal/acceptance-tracker'
    );
    const record = buildTermsAcceptanceRecord('2026-04-10T10:00:00Z');

    expect(record.termsVersion).toBe('v2026.08');
    expect(record.route).toBe('/terms');
    expect(record.acceptedAt).toBe('2026-04-10T10:00:00Z');
  });

  it('buildTermsAcceptanceRecord defaults acceptedAt to now', async () => {
    const { buildTermsAcceptanceRecord } = await import(
      '@/lib/legal/acceptance-tracker'
    );
    const before = new Date().toISOString();
    const record = buildTermsAcceptanceRecord();
    const after = new Date().toISOString();

    expect(record.acceptedAt >= before).toBe(true);
    expect(record.acceptedAt <= after).toBe(true);
  });

  it('hasAcceptedTerms returns false when no record in localStorage', async () => {
    const { hasAcceptedTerms } = await import('@/lib/legal/acceptance-tracker.client');
    localStorage.clear();

    expect(hasAcceptedTerms('v2026.08')).toBe(false);
  });

  it('recordTermsAcceptance writes version record to localStorage', async () => {
    const { recordTermsAcceptance, TERMS_ACCEPTANCE_KEY } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    localStorage.clear();
    recordTermsAcceptance('v2026.08');

    const stored = localStorage.getItem(TERMS_ACCEPTANCE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.termsVersion).toBe('v2026.08');
    expect(parsed.route).toBe('/terms');
  });
});

describe('TermsAcceptanceBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows acceptance strip on initial visit (no prior localStorage record)', async () => {
    const { getStoredAcceptanceRecord } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    vi.mocked(getStoredAcceptanceRecord).mockReturnValue(null);

    const { TermsAcceptanceBanner } = await import(
      '@/components/legal/terms-acceptance-banner'
    );
    render(<TermsAcceptanceBanner currentVersion="v2026.08" />);

    await waitFor(() => {
      expect(
        screen.getByText(/I have read and accept/i)
      ).toBeInTheDocument();
    });
  });

  it('shows updated-version banner when stored version differs from current', async () => {
    const { getStoredAcceptanceRecord } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    vi.mocked(getStoredAcceptanceRecord).mockReturnValue({
      termsVersion: 'v2026.01',
      acceptedAt: '2026-01-15T00:00:00Z',
      route: '/terms',
    });

    const { TermsAcceptanceBanner } = await import(
      '@/components/legal/terms-acceptance-banner'
    );
    render(<TermsAcceptanceBanner currentVersion="v2026.08" />);

    await waitFor(() => {
      expect(
        screen.getAllByText(/terms.*updated|updated.*terms/i).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders nothing when user has already accepted current version', async () => {
    const { getStoredAcceptanceRecord } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    vi.mocked(getStoredAcceptanceRecord).mockReturnValue({
      termsVersion: 'v2026.08',
      acceptedAt: '2026-04-01T00:00:00Z',
      route: '/terms',
    });

    const { TermsAcceptanceBanner } = await import(
      '@/components/legal/terms-acceptance-banner'
    );
    const { container } = render(<TermsAcceptanceBanner currentVersion="v2026.08" />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('writes to localStorage and hides banner when Confirm clicked with checkbox checked', async () => {
    const { getStoredAcceptanceRecord, TERMS_ACCEPTANCE_KEY } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    vi.mocked(getStoredAcceptanceRecord).mockReturnValue(null);

    const { TermsAcceptanceBanner } = await import(
      '@/components/legal/terms-acceptance-banner'
    );
    render(<TermsAcceptanceBanner currentVersion="v2026.08" />);

    await waitFor(() => {
      expect(screen.getByText(/I have read and accept/i)).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    const confirmBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(confirmBtn);

    // Banner should disappear after confirm
    await waitFor(() => {
      expect(screen.queryByText(/I have read and accept/i)).not.toBeInTheDocument();
    });

    // Verify localStorage was actually written (Finding 2 fix)
    const stored = localStorage.getItem(TERMS_ACCEPTANCE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.termsVersion).toBe('v2026.08');
  });
});

describe('acceptance-tracker error paths', () => {
  it('getStoredAcceptanceRecord returns null when localStorage contains invalid JSON', async () => {
    const { getStoredAcceptanceRecord, TERMS_ACCEPTANCE_KEY } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    localStorage.setItem(TERMS_ACCEPTANCE_KEY, 'not-valid-json{');

    const result = getStoredAcceptanceRecord();
    expect(result).toBeNull();
  });

  it('getStoredAcceptanceRecord returns null when shape does not match', async () => {
    const { getStoredAcceptanceRecord, TERMS_ACCEPTANCE_KEY } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    localStorage.setItem(TERMS_ACCEPTANCE_KEY, JSON.stringify({ foo: 'bar' }));

    const result = getStoredAcceptanceRecord();
    expect(result).toBeNull();
  });

  it('hasAcceptedTerms returns false when stored version does not match current', async () => {
    const { hasAcceptedTerms, recordTermsAcceptance } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    recordTermsAcceptance('v2026.01');
    expect(hasAcceptedTerms('v2026.08')).toBe(false);
  });

  it('hasAcceptedTerms returns true when stored version matches current', async () => {
    const { hasAcceptedTerms, recordTermsAcceptance } = await import(
      '@/lib/legal/acceptance-tracker.client'
    );
    recordTermsAcceptance('v2026.08');
    expect(hasAcceptedTerms('v2026.08')).toBe(true);
  });
});
