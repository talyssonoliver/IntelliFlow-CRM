/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

import PressPage, { metadata } from '../page';
import PressReleasePage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from '../[id]/page';

describe('Press page', () => {
  it('says no press releases are published yet and sends media enquiries to the contact page', () => {
    render(<PressPage />);

    expect(screen.getByRole('heading', { name: 'No press releases yet' })).toBeInTheDocument();
    const contactLinks = screen
      .getAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/contact');
    expect(contactLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('shows no invented news, awards, company facts, media kit or press phone', () => {
    const { container } = render(<PressPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/ISO ?27001|SOC ?2|certif/i);
    expect(text).not.toMatch(/award|recognition|seed funding|\$5M|Customers|Employees/i);
    expect(text).not.toMatch(/Media Kit|555/i);
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.querySelector('a[download]')).toBeNull();
  });

  it('describes the page without promising a media kit', () => {
    expect(String(metadata.description)).not.toMatch(/media kit/i);
  });
});

describe('Press release detail page', () => {
  it('builds no release pages while none are published', () => {
    expect(generateStaticParams()).toEqual([]);
  });

  it('serves no page for an id outside the published list', () => {
    expect(dynamicParams).toBe(false);
  });

  it('returns not found for a release that was removed', async () => {
    await expect(PressReleasePage({ params: Promise.resolve({ id: 'pr-003' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(notFound).toHaveBeenCalled();

    const meta = await generateMetadata({ params: Promise.resolve({ id: 'pr-003' }) });
    expect(meta.title).toBe('Press Release Not Found');
  });
});
