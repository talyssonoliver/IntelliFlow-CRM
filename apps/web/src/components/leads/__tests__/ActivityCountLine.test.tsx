import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityCountLine } from '../ActivityCountLine';

describe('ActivityCountLine', () => {
  it('shows the count of person-written activity', () => {
    render(<ActivityCountLine shown={3} total={8} system={2} />);
    expect(screen.getByTestId('activity-count-line').textContent).toBe('Showing 3 of 8 activities');
  });

  it('on a lead with only system entries, says so instead of "Showing 0 of 0"', () => {
    render(<ActivityCountLine shown={0} total={0} system={5} />);
    const line = screen.getByTestId('activity-count-line');
    expect(line.textContent).toBe(
      'No emails, calls, notes or meetings yet. Only system updates so far.'
    );
    expect(screen.queryByText(/Showing 0 of 0/)).toBeNull();
  });

  it('renders nothing when the lead has no activity', () => {
    const { container } = render(<ActivityCountLine shown={0} total={0} system={0} />);
    expect(container.firstChild).toBeNull();
  });
});
