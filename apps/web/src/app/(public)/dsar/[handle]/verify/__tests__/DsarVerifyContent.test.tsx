/**
 * @vitest-environment jsdom
 *
 * PG-203 DSAR — confirming a request from the emailed link (spec Addendum A, S4).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';

const h = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock('@/lib/trpc', () => ({
  trpc: { privacy: { verify: { useMutation: () => ({ mutateAsync: h.verify }) } } },
}));

import DsarVerifyContent from '../DsarVerifyContent';
import DsarVerifyPage, { generateMetadata } from '../page';

const TOKEN = 'A'.repeat(43);
const LINK = `#r=clhrequest000000000.${TOKEN}`;

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', `/dsar/smith-law/verify${LINK}`);
});

describe('DsarVerifyContent', () => {
  it('confirms once with the fragment, strips it, and shows the due date', async () => {
    h.verify.mockResolvedValue({
      type: 'ACCESS',
      dueDate: '2026-11-22T10:00:00.000Z',
      exportEmailed: true,
    });
    const { container } = render(
      <React.StrictMode>
        <DsarVerifyContent />
      </React.StrictMode>
    );
    expect(await screen.findByRole('heading', { name: 'Your request is confirmed' })).toBeTruthy();
    expect(screen.getByText('The firm must respond by 22 November 2026.')).toBeTruthy();
    expect(screen.getByText(/emailed you a link to download your data/)).toBeTruthy();
    expect(h.verify).toHaveBeenCalledTimes(1);
    expect(h.verify).toHaveBeenCalledWith({ requestId: 'clhrequest000000000', token: TOKEN });
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain(TOKEN);
    await axeClean(container);
  });

  it('moves focus to the result heading and titles the page for the result', async () => {
    h.verify.mockResolvedValue({
      type: 'ACCESS',
      dueDate: '2026-11-22T10:00:00.000Z',
      exportEmailed: false,
    });
    render(<DsarVerifyContent />);
    const heading = await screen.findByRole('heading', { name: 'Your request is confirmed' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute('tabindex')).toBe('-1');
    expect(document.title).toBe('Your request is confirmed');
  });

  it('focuses the heading and retitles the page for an invalid link', async () => {
    h.verify.mockRejectedValue(Object.assign(new Error('x'), { data: { code: 'BAD_REQUEST' } }));
    render(<DsarVerifyContent />);
    const heading = await screen.findByRole('heading', {
      name: 'This link is invalid or has expired',
    });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.title).toBe('This link is invalid or has expired');
  });

  it('says nothing about an export for other request types', async () => {
    h.verify.mockResolvedValue({
      type: 'ERASURE',
      dueDate: '2026-11-22T10:00:00.000Z',
      exportEmailed: false,
    });
    render(<DsarVerifyContent />);
    expect(await screen.findByText('Delete my data')).toBeTruthy();
    expect(screen.queryByText(/download your data/)).toBeNull();
  });

  it('explains an invalid or expired link', async () => {
    h.verify.mockRejectedValue(Object.assign(new Error('x'), { data: { code: 'BAD_REQUEST' } }));
    render(<DsarVerifyContent />);
    expect(
      await screen.findByRole('heading', { name: 'This link is invalid or has expired' })
    ).toBeTruthy();
  });

  it('asks to retry later when throttled', async () => {
    h.verify.mockRejectedValue(
      Object.assign(new Error('x'), { data: { code: 'TOO_MANY_REQUESTS' } })
    );
    render(<DsarVerifyContent />);
    expect(await screen.findByRole('heading', { name: 'Please try again shortly' })).toBeTruthy();
  });

  it('never calls the server without a link', async () => {
    window.history.replaceState(null, '', '/dsar/smith-law/verify');
    render(<DsarVerifyContent />);
    expect(await screen.findByRole('heading', { name: 'This link is incomplete' })).toBeTruthy();
    expect(h.verify).not.toHaveBeenCalled();
  });
});

describe('page shell', () => {
  it('is never indexed', async () => {
    await expect(generateMetadata()).resolves.toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(DsarVerifyPage().type).toBe(DsarVerifyContent);
  });
});
