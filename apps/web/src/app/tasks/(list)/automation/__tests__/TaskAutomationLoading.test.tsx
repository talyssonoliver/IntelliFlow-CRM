/**
 * @vitest-environment jsdom
 *
 * TaskAutomationLoading — PG-208: the skeleton mirrors the 8 / 4 bento grid and
 * the route loading.tsx renders it.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import TaskAutomationLoading from '../TaskAutomationLoading';
import Loading from '../loading';

describe('TaskAutomationLoading', () => {
  it('mirrors the 8 / 4 grid with a busy, labelled region', () => {
    render(<TaskAutomationLoading />);
    const status = screen.getByLabelText('Loading task automation');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('skeleton-rules').className).toMatch(/lg:col-span-8/);
    expect(screen.getByTestId('skeleton-settings').parentElement?.className).toMatch(
      /lg:col-span-4/
    );
    expect(screen.getByTestId('skeleton-tags')).toBeInTheDocument();
  });

  it('is the route loading state', () => {
    render(<Loading />);
    expect(screen.getByLabelText('Loading task automation')).toBeInTheDocument();
  });
});
