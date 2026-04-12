// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockDpa = {
  metadata: {
    title: 'Data Processing Addendum',
    version: 'v2026.08',
    effectiveDate: '2026-08-13',
    contactEmail: 'legal@intelliflow-crm.com',
    summary: ['IntelliFlow acts as a data processor under GDPR Article 28'],
  },
  sections: [
    { id: 'introduction', heading: 'Introduction and Parties', body: ['Test body'] },
    { id: 'subject-matter', heading: 'Subject Matter and Duration', body: ['Test body'] },
  ],
};

vi.mock('@/lib/legal/signature-handler', () => ({
  getDpa: () => mockDpa,
  formatDpaDate: () => '13 August 2026',
}));

vi.mock('@/components/legal/dpa-signature-panel', () => ({
  DpaSignaturePanel: () => <div data-testid="dpa-signature-panel" />,
}));

import DpaPage from '../page';

describe('DpaPage', () => {
  it('renders <h1> with DPA title from mock data', () => {
    render(<DpaPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Data Processing Addendum');
  });

  it('renders DPA version string', () => {
    render(<DpaPage />);
    expect(screen.getByText(/v2026\.08/)).toBeTruthy();
  });

  it('renders effective date', () => {
    render(<DpaPage />);
    expect(screen.getByText(/13 August 2026/)).toBeTruthy();
  });

  it('renders legal contact email', () => {
    render(<DpaPage />);
    // Email appears in multiple places (info card + CTA card) — use getAllByText
    const emailMatches = screen.getAllByText(/legal@intelliflow-crm\.com/);
    expect(emailMatches.length).toBeGreaterThan(0);
  });

  it('renders all section headings from mock data', () => {
    render(<DpaPage />);
    // Headings appear in both sidebar nav and section cards — use getAllByText
    const introMatches = screen.getAllByText('Introduction and Parties');
    expect(introMatches.length).toBeGreaterThan(0);
    const subjectMatches = screen.getAllByText('Subject Matter and Duration');
    expect(subjectMatches.length).toBeGreaterThan(0);
  });

  it('renders Download DPA Template link with href to /legal/dpa-template.pdf', () => {
    render(<DpaPage />);
    const links = screen.getAllByRole('link', { name: /download dpa template/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute('href', '/legal/dpa-template.pdf');
  });

  it('renders DpaSignaturePanel via data-testid', () => {
    render(<DpaPage />);
    expect(screen.getByTestId('dpa-signature-panel')).toBeTruthy();
  });
});
