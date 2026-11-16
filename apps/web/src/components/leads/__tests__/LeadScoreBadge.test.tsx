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

  it('marks a low-confidence score as needing review', () => {
    render(<LeadScoreBadge score={34} scoringStatus="NEEDS_REVIEW" />);
    expect(screen.getByText('(low confidence, needs review)', { exact: false })).toBeTruthy();
    expect(screen.getByTitle('Low confidence: needs review').textContent).toBe('?');
  });

  it('has no review mark for a confident score', () => {
    render(<LeadScoreBadge score={34} scoringStatus="SCORED" />);
    expect(screen.queryByTitle('Low confidence: needs review')).toBeNull();
  });
});
