// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stub server-only so server modules can be imported in jsdom tests
vi.mock('server-only', () => ({}));

import PrivacyPage, { metadata } from '../page';

describe('PrivacyPage', () => {
  it('renders the page heading and summary content', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { name: /privacy policy/i })).toBeInTheDocument();
    expect(screen.getByText(/transparency and privacy-by-design/i)).toBeInTheDocument();
    expect(screen.getByText(/we collect account, product usage/i)).toBeInTheDocument();
  });

  it('renders current policy metadata sourced from the helper', () => {
    render(<PrivacyPage />);

    expect(screen.getByText('v2026.03')).toBeInTheDocument();
    expect(screen.getByText(/8 march 2026/i)).toBeInTheDocument();

    const emailLinks = screen.getAllByRole('link', { name: /privacy@intelliflow-crm\.com/i });
    expect(emailLinks.length).toBeGreaterThanOrEqual(1);
    expect(emailLinks[0]).toHaveAttribute('href', 'mailto:privacy@intelliflow-crm.com');
  });

  it('renders a main landmark and section navigation links', () => {
    render(<PrivacyPage />);

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'main-content');

    expect(screen.getByRole('link', { name: /information we collect/i })).toHaveAttribute(
      'href',
      '#information-we-collect'
    );
    expect(screen.getByRole('heading', { name: /your rights/i })).toBeInTheDocument();
  });

  it('exports metadata for the canonical privacy route', () => {
    expect(metadata.title).toBe('Privacy Policy | IntelliFlow CRM');
    expect(metadata.alternates?.canonical).toBe('/privacy');
    expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/privacy');
  });
});

describe('consent-tracker', () => {
  it('buildConsentRecord returns a valid consent record', async () => {
    const { buildConsentRecord } = await import('@/lib/legal/consent-tracker');
    const record = buildConsentRecord('2026-03-08T10:00:00Z');

    expect(record.policyVersion).toBe('v2026.03');
    expect(record.reviewedAt).toBe('2026-03-08T10:00:00Z');
    expect(record.route).toBe('/privacy');
  });

  it('buildConsentRecord defaults reviewedAt to now', async () => {
    const { buildConsentRecord } = await import('@/lib/legal/consent-tracker');
    const before = new Date().toISOString();
    const record = buildConsentRecord();
    const after = new Date().toISOString();

    expect(record.reviewedAt >= before).toBe(true);
    expect(record.reviewedAt <= after).toBe(true);
  });

  it('formatPolicyDate formats ISO dates in en-GB locale', async () => {
    const { formatPolicyDate } = await import('@/lib/legal/consent-tracker');
    const result = formatPolicyDate('2026-01-15');

    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('getPrivacyPolicy returns parsed sections from content file', async () => {
    const { getPrivacyPolicy } = await import('@/lib/legal/consent-tracker');
    const policy = getPrivacyPolicy();

    expect(policy.metadata.title).toBe('Privacy Policy');
    expect(policy.metadata.version).toBe('v2026.03');
    expect(policy.metadata.contactEmail).toBe('privacy@intelliflow-crm.com');
    expect(policy.metadata.summary.length).toBeGreaterThanOrEqual(4);
    for (const bullet of policy.metadata.summary) {
      expect(bullet).toMatch(/[.!?]$/);
    }
    expect(policy.metadata.summary[0]).toMatch(/operate IntelliFlow CRM\.$/);
    expect(policy.sections.length).toBeGreaterThanOrEqual(6);
    expect(policy.sections[0].id).toBe('information-we-collect');
    expect(policy.sections[0].body.length).toBeGreaterThanOrEqual(1);
  });
});
