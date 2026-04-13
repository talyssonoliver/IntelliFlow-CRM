// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockAup = {
  metadata: {
    title: 'Acceptable Use Policy',
    version: 'v2026.08',
    effectiveDate: '2026-08-15',
    contactEmail: 'legal@intelliflow-crm.com',
    summary: [
      'IntelliFlow CRM is a shared platform; this policy defines the boundaries.',
      'Prohibited activities include abuse, fraud, and platform attacks.',
    ],
  },
  sections: [
    { id: 'introduction', heading: 'Introduction', body: ['Test intro paragraph.'] },
    {
      id: 'prohibited-activities',
      heading: 'Prohibited Activities',
      body: ['Test prohibited body.'],
    },
    {
      id: 'reporting-violations',
      heading: 'Reporting Violations',
      body: ['Test reporting body.'],
    },
  ],
};

vi.mock('@/lib/legal/violation-tracker', () => ({
  getAup: () => mockAup,
  formatAupDate: () => '15 August 2026',
  VIOLATION_REPORT_MAILTO_SUBJECT: 'AUP%20violation%20report',
}));

import AupPage from '../page';

describe('AupPage', () => {
  it('renders <h1> with AUP title from mock data', () => {
    render(<AupPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Acceptable Use Policy');
  });

  it('renders AUP version string', () => {
    render(<AupPage />);
    expect(screen.getByText(/v2026\.08/)).toBeTruthy();
  });

  it('renders effective date', () => {
    render(<AupPage />);
    expect(screen.getByText(/15 August 2026/)).toBeTruthy();
  });

  it('renders legal contact email in multiple locations', () => {
    render(<AupPage />);
    const emailMatches = screen.getAllByText(/legal@intelliflow-crm\.com/);
    expect(emailMatches.length).toBeGreaterThan(1);
  });

  it('renders all section headings (in both nav and cards)', () => {
    render(<AupPage />);
    for (const heading of ['Introduction', 'Prohibited Activities', 'Reporting Violations']) {
      const matches = screen.getAllByText(heading);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it('renders the "Report a violation" mailto anchor with the subject query string', () => {
    render(<AupPage />);
    const anchor = screen.getByRole('link', { name: /report a violation/i });
    expect(anchor.getAttribute('href')).toBe(
      'mailto:legal@intelliflow-crm.com?subject=AUP%20violation%20report'
    );
  });

  it('renders the AUP sections quick-links nav with aria-label', () => {
    render(<AupPage />);
    const nav = screen.getByLabelText(/aup sections/i);
    expect(nav).toBeTruthy();
  });
});
