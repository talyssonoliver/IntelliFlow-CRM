import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreChangeRow } from '../ScoreChangeRow';

describe('ScoreChangeRow', () => {
  it('shows the move from the previous score to the new one', () => {
    render(<ScoreChangeRow meta={{ previousScore: 30, newScore: 40 }} />);
    const row = screen.getByTestId('score-change');
    expect(row).toHaveTextContent('Score changed from');
    expect(row).toHaveTextContent('30');
    expect(row).toHaveTextContent('40');
  });

  it('says "First score" instead of an empty "from" for a first score', () => {
    render(<ScoreChangeRow meta={{ newScore: 38, firstScore: true }} />);
    const row = screen.getByTestId('score-change');
    expect(row).toHaveTextContent('First score');
    expect(row).not.toHaveTextContent('Score changed from');
    expect(row).toHaveTextContent('38');
  });

  it('renders nothing when there is no new score', () => {
    const { container } = render(<ScoreChangeRow meta={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('hides the arrow from assistive technology', () => {
    render(<ScoreChangeRow meta={{ previousScore: 1, newScore: 2 }} />);
    expect(screen.getByText('arrow_forward')).toHaveAttribute('aria-hidden', 'true');
  });
});
