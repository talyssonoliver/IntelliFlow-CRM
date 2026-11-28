/**
 * @vitest-environment jsdom
 *
 * IFC-317 — the other controller's download page (UK GDPR Art 20(2)): the token is read from
 * the fragment once and stripped, nothing is fetched on load (a mail scanner must not use the
 * single-use link up), and every failure reads the same.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';

const h = vi.hoisted(() => ({ download: { mutateAsync: vi.fn(), isPending: false } }));

vi.mock('@/lib/trpc', () => ({
  trpc: { privacy: { downloadTransfer: { useMutation: () => h.download } } },
}));

import DsarTransferContent, { transferErrorMessage } from '../DsarTransferContent';
import DsarTransferPage, { generateMetadata } from '../page';

const TOKEN = 'B'.repeat(43);

const EXPORT = {
  generatedAt: '2026-11-28T10:00:00.000Z',
  processingInformation: {
    controller: { name: 'Smith Law', privacyUrl: null },
    purposes: ['Managing enquiries'],
    categories: ['Identity and contact details'],
    recipients: ['The firm’s CRM provider'],
    retention: 'See the firm’s privacy notice.',
    source: 'You',
    rights: ['Access (Art 15)'],
    complaint: 'You can complain to the ICO.',
    automatedDecisions: 'No solely automated decisions.',
  },
  data: { leads: [{ email: 'ada@example.invalid', firstName: '<img src=x onerror=alert(1)>' }] },
  withheld: [],
};

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.download = { mutateAsync: vi.fn().mockResolvedValue(EXPORT), isPending: false };
  window.history.replaceState(null, '', `/dsar/transfer#t=${TOKEN}`);
});

describe('DsarTransferContent', () => {
  it('strips the fragment at once and downloads only when asked', async () => {
    const { container } = render(
      <React.StrictMode>
        <DsarTransferContent />
      </React.StrictMode>
    );
    const button = await screen.findByRole('button', { name: 'Get the data' });
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/dsar/transfer');
    expect(h.download.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/The link works once/)).toBeTruthy();
    await axeClean(container);
    fireEvent.click(button);
    expect(await screen.findByText('Enquiry records: 1')).toBeTruthy();
    expect(h.download.mutateAsync).toHaveBeenCalledTimes(1);
    expect(h.download.mutateAsync).toHaveBeenCalledWith({ token: TOKEN });
    expect(screen.getByText(/The link is now used up/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save as a file' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save as spreadsheets (CSV)' })).toBeTruthy();
    // Data is text, never injected HTML.
    expect(container.querySelector('img')).toBeNull();
  });

  it('uses the link once even when the button is pressed twice while it is pending', async () => {
    h.download.isPending = true;
    render(<DsarTransferContent />);
    const button = await screen.findByRole('button', { name: 'Preparing…' });
    fireEvent.click(button);
    expect(h.download.mutateAsync).not.toHaveBeenCalled();
  });

  it('says the same thing for every dead link, never which kind', async () => {
    h.download.mutateAsync.mockRejectedValue(
      Object.assign(new Error('This link is not available.'), { data: { code: 'NOT_FOUND' } })
    );
    render(<DsarTransferContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get the data' }));
    const message = await screen.findByText(/This link is not available/);
    expect(message.textContent).not.toMatch(/expired|used|revoked/i);
    expect(screen.getByRole('button', { name: 'Get the data' })).toBeTruthy();
  });

  it('asks the visitor to wait when rate limited', async () => {
    h.download.mutateAsync.mockRejectedValue(
      Object.assign(new Error('Too many requests.'), { data: { code: 'TOO_MANY_REQUESTS' } })
    );
    render(<DsarTransferContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get the data' }));
    expect(await screen.findByText(/Too many attempts/)).toBeTruthy();
  });

  it('shows an incomplete-link notice, and fetches nothing, when the fragment is missing or malformed', async () => {
    window.history.replaceState(null, '', '/dsar/transfer#t=short');
    const { container } = render(<DsarTransferContent />);
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(h.download.mutateAsync).not.toHaveBeenCalled();
    await axeClean(container);
  });

  it('words failures without a cause', () => {
    expect(transferErrorMessage(new Error('db down'))).toMatch(/not available/);
    expect(transferErrorMessage(null)).toMatch(/not available/);
  });
});

describe('page', () => {
  it('is never indexed and renders the content', async () => {
    expect(await generateMetadata()).toMatchObject({ robots: { index: false, follow: false } });
    window.history.replaceState(null, '', '/dsar/transfer');
    render(<DsarTransferPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'This link is incomplete' })).toBeTruthy()
    );
  });
});
