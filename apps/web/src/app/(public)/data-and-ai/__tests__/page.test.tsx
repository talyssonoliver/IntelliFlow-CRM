// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DataAndAiPage, { metadata } from '../page';
import { SECTIONS, SUB_PROCESSORS } from '../content';

const DPA = readFileSync(
  resolve(__dirname, '../../../../../../../docs/shared/dpa-content.md'),
  'utf8'
);
const dpaText = DPA.replace(/\s+/g, ' ');

describe('DataAndAiPage', () => {
  it('renders the title and the last-updated line', () => {
    render(<DataAndAiPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Data and AI');
    expect(screen.getByText('Last updated 22 November 2026')).toBeInTheDocument();
  });

  it('has a canonical path and static metadata', () => {
    expect(metadata.alternates?.canonical).toBe('/data-and-ai');
    expect(metadata.title).toBe('Data and AI');
  });

  it('renders every section heading', () => {
    render(<DataAndAiPage />);
    for (const section of SECTIONS) {
      expect(screen.getByRole('heading', { level: 2, name: section.heading })).toBeInTheDocument();
    }
  });

  it('names Anthropic as the only text provider and cites its terms with their date', () => {
    render(<DataAndAiPage />);
    expect(screen.getAllByText(/only provider that writes text/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Anthropic Commercial Terms' })).toHaveAttribute(
      'href',
      'https://www.anthropic.com/legal/commercial-terms'
    );
    expect(screen.getByRole('link', { name: 'Gemini API Additional Terms' })).toHaveAttribute(
      'href',
      'https://ai.google.dev/gemini-api/terms'
    );
    expect(screen.getByText(/read on 22 November 2026/)).toBeInTheDocument();
  });

  it('says replies are never sent without approval and mail access starts only when connected', () => {
    render(<DataAndAiPage />);
    expect(screen.getByText(/never sent without your approval/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no access to your email or calendar until you connect/i)
    ).toBeInTheDocument();
  });

  it('does not claim automatic mail retention, whole-workspace export or certifications', () => {
    const { container } = render(<DataAndAiPage />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/does not delete synced email automatically/);
    expect(text).toMatch(/no whole-workspace export or deletion feature yet/);
    expect(text).toMatch(
      /does not hold SOC 2, ISO\/IEC 27001 or any other independent security certification/
    );
    expect(text).not.toMatch(/within 30 days of (your|a) request/i);
  });

  it('renders a sub-processor table with a terms link for each row', () => {
    render(<DataAndAiPage />);
    const table = screen.getByRole('table', { name: 'Aurora sub-processors' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(SUB_PROCESSORS.length + 1);
    for (const p of SUB_PROCESSORS) {
      const link = within(table)
        .getAllByRole('link', { name: p.termsLabel })
        .find((a) => a.getAttribute('href') === p.termsUrl);
      expect(link, p.name).toBeDefined();
      expect(p.termsUrl).toMatch(/^https:\/\//);
    }
    expect(within(table).getByText(/Frankfurt/)).toBeInTheDocument();
    expect(within(table).getByText(/Netherlands/)).toBeInTheDocument();
    expect(within(table).getByText(/London/)).toBeInTheDocument();
  });

  it('lists no provider that was removed or is unused', () => {
    const names = SUB_PROCESSORS.map((p) => p.name);
    expect(names).not.toContain('OpenRouter');
    expect(names).not.toContain('Twilio');
    render(<DataAndAiPage />);
    expect(screen.getByText(/OpenRouter has been removed/)).toBeInTheDocument();
    expect(screen.getByText(/Twilio is not used/)).toBeInTheDocument();
  });

  it('links to the privacy, DPA and security pages', () => {
    render(<DataAndAiPage />);
    for (const href of ['/privacy', '/dpa', '/security']) {
      expect(document.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
  });
});

describe('the DPA sub-processor list matches the page', () => {
  it('names every provider in the table', () => {
    for (const p of SUB_PROCESSORS) {
      expect(dpaText, p.dpaName).toContain(p.dpaName);
    }
  });

  it('no longer says Anthropic is not enabled, and marks OpenRouter removed and Twilio unused', () => {
    expect(dpaText).not.toMatch(/Anthropic, PBC,?[^.]*not enabled in production/);
    expect(dpaText).toContain('OpenRouter, Inc. has been removed');
    expect(dpaText).toContain('Twilio Inc. is not used');
    expect(dpaText).not.toContain('Twilio Inc. delivers SMS');
  });

  it('points to the Data and AI page', () => {
    expect(dpaText).toContain('/data-and-ai');
  });
});
