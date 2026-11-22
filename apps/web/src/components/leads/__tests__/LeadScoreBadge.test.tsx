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

  it('shows the red "?" only when the confidence is really low (< 0.6)', () => {
    render(<LeadScoreBadge score={34} scoringStatus="NEEDS_REVIEW" scoreConfidence={0.4} />);
    expect(screen.getByTitle(/^Low confidence:/).textContent).toBe('?');
    expect(screen.getByText('(Low confidence', { exact: false })).toBeTruthy();
    expect(screen.queryByText('Few signals yet')).toBeNull();
  });

  it('shows a quiet "Few signals yet" between 0.6 and 0.85, with an explaining label', () => {
    render(<LeadScoreBadge score={34} scoringStatus="NEEDS_REVIEW" scoreConfidence={0.7} />);
    const note = screen.getByTitle(/little activity/);
    // Visible text plus an sr-only explanation: the accessible name is spoken once.
    expect(note.textContent).toMatch(/^Few signals yet\. This score is based on little activity/);
    expect(note.querySelector('.sr-only')?.textContent).toMatch(/based on little activity/);
    expect(note.className).toContain('text-slate-600');
    expect(screen.queryByText('?')).toBeNull();
  });

  it('shows no flag at 0.85 and above', () => {
    render(<LeadScoreBadge score={34} scoringStatus="SCORED" scoreConfidence={0.9} />);
    expect(screen.queryByText('Few signals yet')).toBeNull();
    expect(screen.queryByText('?')).toBeNull();
  });

  it('keeps the review gate but shows no flag at exactly 0.85', () => {
    render(<LeadScoreBadge score={34} scoringStatus="NEEDS_REVIEW" scoreConfidence={0.85} />);
    expect(screen.queryByText('Few signals yet')).toBeNull();
    expect(screen.queryByText('?')).toBeNull();
  });

  it('a NEEDS_REVIEW lead with no stored confidence gets the quiet note, not the red mark', () => {
    render(<LeadScoreBadge score={34} scoringStatus="NEEDS_REVIEW" />);
    expect(screen.getByText('Few signals yet')).toBeTruthy();
    expect(screen.queryByText('?')).toBeNull();
  });

  it('has no flag for a scored lead with no stored confidence', () => {
    render(<LeadScoreBadge score={34} scoringStatus="SCORED" />);
    expect(screen.queryByText('Few signals yet')).toBeNull();
    expect(screen.queryByText('?')).toBeNull();
  });
});
