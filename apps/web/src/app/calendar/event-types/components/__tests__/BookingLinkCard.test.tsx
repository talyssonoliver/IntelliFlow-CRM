/**
 * @vitest-environment jsdom
 *
 * PG-203 — Booking link card (AC-007, Q7, Q10, Q12, AC-026).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { BookingLinkCard, type BookingLinkCardProps } from '../BookingLinkCard';

function renderCard(overrides: Partial<BookingLinkCardProps> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const utils = render(
    <BookingLinkCard
      link={{ handle: 'smith-law', privacyUrl: null, availabilityConfigured: true }}
      canEdit
      isSaving={false}
      onSave={onSave}
      {...overrides}
    />
  );
  return { ...utils, onSave };
}

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => vi.clearAllMocks());

describe('BookingLinkCard', () => {
  it('shows the live base URL with a copy button when booking is on', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = renderCard();
    expect(screen.getByText('Booking is on.')).toBeInTheDocument();
    expect(screen.getByText(`${window.location.origin}/book/smith-law/…`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy base link' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/book/smith-law`)
    );
    await axeClean(container);
  });

  it('says booking is off until a handle is set', () => {
    renderCard({ link: { handle: null, privacyUrl: null, availabilityConfigured: true } });
    expect(screen.getByText('Booking is off: choose a booking handle.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy base link' })).toBeNull();
  });

  it('says booking is off until availability is set, with a link to Availability (owner Q10)', () => {
    renderCard({ link: { handle: 'smith-law', privacyUrl: null, availabilityConfigured: false } });
    expect(screen.getByText(/Booking is off: set your availability first/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set availability' })).toHaveAttribute(
      'href',
      '/calendar/availability'
    );
  });

  it('saves a lowercased handle and an optional https privacy URL', async () => {
    const { onSave } = renderCard({
      link: { handle: null, privacyUrl: null, availabilityConfigured: true },
    });
    fireEvent.change(screen.getByLabelText('Booking handle'), { target: { value: 'Smith-Law' } });
    fireEvent.change(screen.getByLabelText(/Privacy policy URL/), {
      target: { value: 'https://firm.example.invalid/privacy' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        handle: 'smith-law',
        privacyUrl: 'https://firm.example.invalid/privacy',
      })
    );
  });

  it('clears both with empty fields (null)', async () => {
    const { onSave } = renderCard();
    fireEvent.change(screen.getByLabelText('Booking handle'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ handle: null, privacyUrl: null }));
  });

  it('explains a reserved handle or a bad URL before saving', async () => {
    const { onSave } = renderCard();
    fireEvent.change(screen.getByLabelText('Booking handle'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    expect(await screen.findByText('That handle is reserved. Choose another.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Booking handle'), { target: { value: 'smith-law' } });
    fireEvent.change(screen.getByLabelText(/Privacy policy URL/), {
      target: { value: 'http://x.example.invalid' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    expect(
      await screen.findByText('Enter an https:// link to your privacy policy')
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a taken handle from the server inline', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'That booking handle is taken. Choose another.' });
    renderCard({ onSave });
    fireEvent.change(screen.getByLabelText('Booking handle'), { target: { value: 'other-firm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    expect(
      await screen.findByText('That booking handle is taken. Choose another.')
    ).toBeInTheDocument();
  });

  it('is read-only for members', () => {
    renderCard({ canEdit: false });
    expect(screen.getByLabelText('Booking handle')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save link' })).toBeDisabled();
  });
});
