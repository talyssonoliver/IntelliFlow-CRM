/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvailabilityLoading } from '../AvailabilityLoading';

describe('AvailabilityLoading', () => {
  it('is busy, announces loading and hides the skeleton shapes', () => {
    const { container } = render(<AvailabilityLoading />);
    expect((container.firstChild as HTMLElement).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading availability');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('mirrors the bento: four cards spanning 8 / 4 / 8 / 4 columns', () => {
    const { container } = render(<AvailabilityLoading />);
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
    const spans = Array.from(container.querySelectorAll('[class*="lg:col-span-"]')).map(
      (el) => /lg:col-span-(\d+)/.exec(el.className)?.[1]
    );
    expect(spans).toEqual(['8', '4', '8', '4']);
  });
});
