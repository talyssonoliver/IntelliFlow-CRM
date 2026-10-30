/**
 * @vitest-environment jsdom
 *
 * PG-203 DSAR — the public data request form (spec Addendum A; D-AC-01/02).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';

const h = vi.hoisted(() => ({
  firm: { data: undefined as unknown, isLoading: false },
  submit: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    privacy: {
      getFirm: { useQuery: () => h.firm },
      submit: { useMutation: () => h.submit },
    },
  },
}));

import DsarRequestContent, {
  looksLikeEmail,
  requestErrorMessage,
  validateRequest,
} from '../DsarRequestContent';
import DsarRequestPage, { generateMetadata } from '../page';

const MESSAGE =
  'Thank you. If this address can receive email, a confirmation link is on its way. Your request starts when you confirm it.';

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

function renderForm() {
  return render(<DsarRequestContent handle="smith-law" />);
}

function fillValid(type = 'Get a copy of my data') {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(type) }));
  fireEvent.change(screen.getByLabelText('Your email address'), {
    target: { value: ' ada@example.invalid ' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.firm = {
    data: { firmName: 'Smith Law', privacyUrl: 'https://smith.example.invalid/privacy' },
    isLoading: false,
  };
  h.submit = { mutateAsync: vi.fn().mockResolvedValue({ message: MESSAGE }), isPending: false };
});

describe('DsarRequestContent', () => {
  it('shows the firm, every request type and no accessibility violations', async () => {
    const { container } = renderForm();
    expect(screen.getByRole('heading', { level: 1, name: 'Make a data request' })).toBeTruthy();
    expect(screen.getByText('Smith Law')).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByRole('link', { name: /privacy notice/ }).getAttribute('href')).toBe(
      'https://smith.example.invalid/privacy'
    );
    await axeClean(container);
  });

  it('lists every problem at once and focuses the first', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Choose what you would like the firm to do.')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    expect(screen.getByText('Please confirm to continue.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe('dsar-type-ACCESS'));
    expect(h.submit.mutateAsync).not.toHaveBeenCalled();
  });

  it('sends a trimmed request and then says only "check your email"', async () => {
    const { container } = renderForm();
    fillValid();
    fireEvent.change(screen.getByLabelText(/Anything that helps/), {
      target: { value: '  My old address  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeTruthy();
    expect(screen.getByText(MESSAGE)).toBeTruthy();
    expect(h.submit.mutateAsync).toHaveBeenCalledWith({
      handle: 'smith-law',
      type: 'ACCESS',
      email: 'ada@example.invalid',
      details: 'My old address',
      consent: true,
      __honeypot: '',
    });
    await axeClean(container);
  });

  it('keeps the pending submit button focusable and ignores a second press', () => {
    h.submit.isPending = true;
    renderForm();
    fillValid();
    const button = screen.getByRole('button', { name: 'Sending…' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(h.submit.mutateAsync).not.toHaveBeenCalled();
  });

  it('asks what an objection is about, and sends the scope', async () => {
    renderForm();
    fillValid('Object to the use of my data');
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Choose what you object to.')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Marketing to me/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(h.submit.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'OBJECTION', objectionScope: 'MARKETING' })
      )
    );
  });

  it('passes the honeypot through so the server can answer bots generically', async () => {
    renderForm();
    fillValid();
    fireEvent.change(screen.getByLabelText('Leave this field empty'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(h.submit.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ __honeypot: 'x' })
      )
    );
  });

  it('shows a fixed message when the server refuses', async () => {
    h.submit.mutateAsync.mockRejectedValue(
      Object.assign(new Error('raw server text'), { data: { code: 'TOO_MANY_REQUESTS' } })
    );
    renderForm();
    fillValid();
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      await screen.findByText('Too many requests from here just now. Please try again later.')
    ).toBeTruthy();
    expect(screen.queryByText('raw server text')).toBeNull();
  });

  it('shows one not-available page for an unknown handle, and a loading state', () => {
    h.firm = { data: undefined, isLoading: false };
    const { unmount } = renderForm();
    expect(screen.getByRole('heading', { name: 'This page is not available' })).toBeTruthy();
    unmount();
    h.firm = { data: undefined, isLoading: true };
    renderForm();
    expect(screen.getByText('Loading')).toBeTruthy();
  });
});

describe('helpers', () => {
  it('checks email shape lightly', () => {
    expect(looksLikeEmail('ada@example.invalid')).toBe(true);
    expect(looksLikeEmail('ada@example')).toBe(false);
    expect(looksLikeEmail('a b@example.invalid')).toBe(false);
  });

  it('requires an objection scope only for objections', () => {
    const base = { email: 'ada@example.invalid', details: '', consent: true };
    expect(validateRequest({ ...base, type: 'ACCESS', objectionScope: '' })).toEqual({});
    expect(validateRequest({ ...base, type: 'OBJECTION', objectionScope: '' })).toHaveProperty(
      'objectionScope'
    );
  });

  it('maps errors to fixed messages', () => {
    expect(requestErrorMessage({ data: { code: 'NOT_FOUND' } })).toBe(
      'This page is no longer available.'
    );
    expect(requestErrorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});

describe('page shell', () => {
  it('is never indexed and has a generic title', async () => {
    await expect(generateMetadata()).resolves.toEqual({
      title: 'Make a data request',
      robots: { index: false, follow: false },
    });
  });

  it('passes the handle to the form', async () => {
    const element = await DsarRequestPage({ params: Promise.resolve({ handle: 'smith-law' }) });
    expect(element.props).toEqual({ handle: 'smith-law' });
  });
});
