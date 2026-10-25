/**
 * @vitest-environment jsdom
 *
 * PG-203 DSAR — downloading a copy of one's data (spec Addendum A; sign-off 2).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';

const h = vi.hoisted(() => ({ download: { mutateAsync: vi.fn(), isPending: false } }));

vi.mock('@/lib/trpc', () => ({
  trpc: { privacy: { downloadExport: { useMutation: () => h.download } } },
}));

import DsarExportContent, { downloadErrorMessage, saveExport } from '../DsarExportContent';
import DsarExportPage, { generateMetadata } from '../page';

const TOKEN = 'A'.repeat(43);

const EXPORT = {
  generatedAt: '2026-10-22T10:00:00.000Z',
  processingInformation: {
    controller: { name: 'Smith Law', privacyUrl: null },
    purposes: ['Managing enquiries'],
    categories: ['Identity and contact details'],
    recipients: ['The firm’s CRM provider (Aurora) as processor'],
    retention: 'See the firm’s privacy notice.',
    source: 'You',
    rights: ['Access (Art 15)'],
    complaint: 'You can complain to the Information Commissioner’s Office (ico.org.uk).',
    automatedDecisions: 'No solely automated decisions.',
  },
  data: {
    leads: [{ email: 'ada@example.invalid', firstName: '<img src=x onerror=alert(1)>' }],
    bookings: [],
  },
  withheld: [
    { category: 'NOTES' as const, count: 2, note: 'Not included while the firm reviews it.' },
  ],
};

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.download = { mutateAsync: vi.fn().mockResolvedValue(EXPORT), isPending: false };
  window.history.replaceState(null, '', `/dsar/smith-law/export#r=clhrequest000000000.${TOKEN}`);
});

describe('DsarExportContent', () => {
  it('strips the fragment at once and downloads only when asked', async () => {
    const { container } = render(
      <React.StrictMode>
        <DsarExportContent />
      </React.StrictMode>
    );
    const button = await screen.findByRole('button', { name: 'Get my data' });
    expect(window.location.hash).toBe('');
    expect(h.download.mutateAsync).not.toHaveBeenCalled();
    await axeClean(container);
    fireEvent.click(button);
    expect(await screen.findByText('Enquiry records: 1')).toBeTruthy();
    expect(h.download.mutateAsync).toHaveBeenCalledWith({
      requestId: 'clhrequest000000000',
      token: TOKEN,
    });
    expect(screen.getByText('Staff notes: 2')).toBeTruthy();
    expect(screen.getByText(/Information Commissioner/)).toBeTruthy();
    await axeClean(container);
  });

  it('renders data as text only and writes nothing to browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { container } = render(<DsarExportContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get my data' }));
    await screen.findByText('Enquiry records: 1');
    expect(container.querySelector('img')).toBeNull();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('labels every withheld category in plain words, including deals, AI and staff text', async () => {
    h.download.mutateAsync.mockResolvedValue({
      ...EXPORT,
      withheld: [
        { category: 'DESCRIPTIONS' as const, count: 2, note: 'Under review.' },
        { category: 'AI_TEXT' as const, count: 3, note: 'Under review.' },
        { category: 'STAFF_TEXT' as const, count: 1, note: 'Under review.' },
        { category: 'OTHER_RECORDS' as const, count: 4, note: 'Under review.' },
      ],
    });
    render(<DsarExportContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get my data' }));
    expect(await screen.findByText('Deal and task descriptions: 2')).toBeTruthy();
    expect(
      screen.getByText('Text written by AI, such as insights and recommendations: 3')
    ).toBeTruthy();
    expect(screen.getByText('Tags, qualification notes and booking answers: 1')).toBeTruthy();
    expect(
      screen.getByText('Calendar events, notifications and experiment records: 4')
    ).toBeTruthy();
  });

  it('saves the file from memory', async () => {
    const create = vi.fn(() => 'blob:dsar');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DsarExportContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get my data' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save as a file' }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:dsar');
    click.mockRestore();
  });

  it('shows the download-limit message from the server, and a fixed one otherwise', async () => {
    h.download.mutateAsync.mockRejectedValueOnce(
      Object.assign(
        new Error('This download link has been used too many times. Contact the firm.'),
        {
          data: { code: 'TOO_MANY_REQUESTS' },
        }
      )
    );
    render(<DsarExportContent />);
    fireEvent.click(await screen.findByRole('button', { name: 'Get my data' }));
    expect(await screen.findByText(/used too many times/)).toBeTruthy();
    expect(downloadErrorMessage(new Error('raw'))).toBe(
      'This link is invalid or has expired. Contact the firm for a new one.'
    );
  });

  it('keeps the button focusable while pending and ignores clicks', async () => {
    h.download.isPending = true;
    render(<DsarExportContent />);
    const button = await screen.findByRole('button', { name: 'Preparing…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(h.download.mutateAsync).not.toHaveBeenCalled();
  });

  it('has a status region mounted before any result and moves focus to the heading on load', async () => {
    render(<DsarExportContent />);
    const button = await screen.findByRole('button', { name: 'Get my data' });
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
    fireEvent.click(button);
    const heading = await screen.findByRole('heading', { name: 'Your personal data' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('status')).toBe(region);
  });

  it('announces a failure in the status region that was already mounted', async () => {
    h.download.mutateAsync.mockRejectedValueOnce(new Error('raw'));
    render(<DsarExportContent />);
    const button = await screen.findByRole('button', { name: 'Get my data' });
    const region = screen.getByRole('status');
    fireEvent.click(button);
    await waitFor(() => expect(region.textContent).toMatch(/invalid or has expired/));
    expect(screen.getByRole('status')).toBe(region);
  });

  it('explains a link without its fragment', async () => {
    window.history.replaceState(null, '', '/dsar/smith-law/export');
    render(<DsarExportContent />);
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeTruthy();
  });
});

describe('saveExport and the page shell', () => {
  it('names the file and serialises the export', () => {
    let blob: Blob | undefined;
    Object.assign(URL, {
      createObjectURL: (b: Blob) => {
        blob = b;
        return 'blob:x';
      },
      revokeObjectURL: () => undefined,
    });
    const anchor = { click: vi.fn(), href: '', download: '' };
    saveExport(EXPORT, { createElement: () => anchor } as unknown as Document);
    expect(anchor.download).toBe('my-personal-data.json');
    expect(blob?.type).toBe('application/json');
  });

  it('is never indexed', async () => {
    await expect(generateMetadata()).resolves.toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(DsarExportPage().type).toBe(DsarExportContent);
  });
});
