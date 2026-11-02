/**
 * @vitest-environment jsdom
 *
 * PG-203 DSAR — the loading skeleton stops pulsing for people who ask for reduced motion.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import PrivacyRequestsLoading from '../loading';

describe('PrivacyRequestsLoading', () => {
  it('turns every pulse off under prefers-reduced-motion', () => {
    const { container } = render(<PrivacyRequestsLoading />);
    const pulsing = container.querySelectorAll('.animate-pulse');
    expect(pulsing.length).toBeGreaterThan(0);
    for (const el of pulsing) expect(el.className).toContain('motion-reduce:animate-none');
  });
});
