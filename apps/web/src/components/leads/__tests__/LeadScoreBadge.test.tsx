import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadScoreBadge } from '../LeadScoreBadge';

describe('LeadScoreBadge', () => {
  it('shows "Not scored" for a lead that was never scored or whose scoring failed', () => {
    const { rerender } = render(<LeadScoreBadge score={0} scoringStatus="NONE" />);
    expect(screen.getByText('Not scored').getAttribute('title')).toBe(
      'This lead has not been scored yet.'
    );
    rerender(<LeadScoreBadge score={0} scoringStatus="FAILED" />);
    expect(screen.getByText('Not scored').getAttribute('title')).toMatch(/tried again/);
  });

  it.each([
    [85, 'bg-green-100'],
    [50, 'bg-amber-100'],
    [30, 'bg-red-100'],
  ])('colours a score of %i with %s', (score, cls) => {
    render(<LeadScoreBadge score={score} scoringStatus="SCORED" />);
    expect(screen.getByText(String(score)).className).toContain(cls);
  });

  // Owner 26/11: the leads list shows the score only; why it is unsure is on the lead page.
  it.each([
    ['really low confidence (< 0.6)', 'NEEDS_REVIEW', 0.4],
    ['few signals (0.6 to 0.85)', 'NEEDS_REVIEW', 0.7],
    ['review status, no stored confidence', 'NEEDS_REVIEW', undefined],
    ['scored, high confidence', 'SCORED', 0.9],
  ])('shows the number only for %s', (_case, status, confidence) => {
    const { container } = render(
      <LeadScoreBadge score={34} scoringStatus={status} scoreConfidence={confidence} />
    );
    expect(container.textContent).toBe('34');
    expect(screen.queryByText('Few signals yet')).toBeNull();
    expect(screen.queryByText(/Low confidence/)).toBeNull();
    expect(screen.queryByText('?')).toBeNull();
    expect(screen.queryByTitle(/little activity|Low confidence/)).toBeNull();
  });
});
