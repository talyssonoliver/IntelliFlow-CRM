import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountScoreBadge } from '../AccountScoreBadge';

describe('AccountScoreBadge (IFC-312)', () => {
  it('renders nothing when score is null', () => {
    const { container } = render(<AccountScoreBadge score={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when score is undefined', () => {
    const { container } = render(<AccountScoreBadge score={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders high-tier badge for score >= 70', () => {
    render(<AccountScoreBadge score={85} />);
    const badge = screen.getByTestId('account-score-badge');
    expect(badge.className).toContain('emerald');
    expect(screen.getByText('85')).toBeDefined();
  });

  it('renders mid-tier badge for 40 <= score < 70', () => {
    render(<AccountScoreBadge score={55} />);
    expect(screen.getByTestId('account-score-badge').className).toContain('amber');
  });

  it('renders low-tier badge for score < 40', () => {
    render(<AccountScoreBadge score={20} />);
    expect(screen.getByTestId('account-score-badge').className).toContain('rose');
  });

  it('tooltip includes modelVersion + factors when supplied', () => {
    render(
      <AccountScoreBadge
        score={78}
        modelVersion="account-scoring-v1"
        factors={[
          { name: 'Engagement', impact: 20 },
          { name: 'Revenue', impact: 25 },
        ]}
      />
    );
    const badge = screen.getByTestId('account-score-badge');
    expect(badge.getAttribute('title')).toContain('account-scoring-v1');
    expect(badge.getAttribute('title')).toContain('Engagement');
  });
});
