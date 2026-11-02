/**
 * @vitest-environment jsdom
 *
 * PG-203 — /book/[handle]/[slug] page shell and metadata (AC-021).
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../BookingContent', () => ({
  default: (props: { handle: string; slug: string }) => (
    <div data-testid="booking-content">
      {props.handle}/{props.slug}
    </div>
  ),
}));

import BookPage, { generateMetadata } from '../page';

describe('/book/[handle]/[slug]', () => {
  it('renders the booking content for the route params', async () => {
    const page = await BookPage({
      params: Promise.resolve({ handle: 'smith-law', slug: 'intro' }),
    });
    render(page);
    expect(screen.getByTestId('booking-content')).toHaveTextContent('smith-law/intro');
  });

  it('is never indexed and uses a generic title that reveals nothing about the firm', async () => {
    const meta = await generateMetadata();
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe('Book an appointment');
  });
});
