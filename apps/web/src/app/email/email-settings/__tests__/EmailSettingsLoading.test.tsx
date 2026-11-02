/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { EmailSettingsLoading } from '../EmailSettingsLoading';

describe('EmailSettingsLoading', () => {
  it('announces loading and hides the placeholders from assistive tech', () => {
    const { container } = render(<EmailSettingsLoading />);
    expect(screen.getByText('Loading email settings')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('mirrors the bento grid: a full-width mailbox card, then the settings cards', () => {
    const { container } = render(<EmailSettingsLoading />);
    expect(container.querySelectorAll('.lg\\:col-span-12').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('.lg\\:col-span-6').length).toBe(4);
  });

  it('has no axe violations', async () => {
    const { container } = render(<EmailSettingsLoading />);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
