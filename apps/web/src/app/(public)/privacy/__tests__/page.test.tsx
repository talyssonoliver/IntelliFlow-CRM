// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

    expect(
      screen.getByRole('link', { name: /information we collect/i })
    ).toHaveAttribute('href', '#information-we-collect');
    expect(
      screen.getByRole('heading', { name: /your rights/i })
    ).toBeInTheDocument();
  });

  it('exports metadata for the canonical privacy route', () => {
    expect(metadata.title).toBe('Privacy Policy | IntelliFlow CRM');
    expect(metadata.alternates?.canonical).toBe('/privacy');
    expect(metadata.openGraph?.url).toBe('https://intelliflow-crm.com/privacy');
  });
});
