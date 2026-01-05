// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe, toHaveNoViolations } from 'vitest-axe';
import { ScoreBadge } from '../src/components/score/ScoreBadge';

expect.extend(toHaveNoViolations);

describe('ScoreBadge', () => {
  describe('Rendering', () => {
    it('should render score value', () => {
      render(<ScoreBadge score={85} />);
      expect(screen.getByText('85')).toBeInTheDocument();
    });

    it('should render with label in inline mode', () => {
      render(<ScoreBadge score={85} mode="inline" />);
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText('Score')).toBeInTheDocument();
    });

    it('should render tooltip on hover in expanded mode', async () => {
      render(
        <ScoreBadge
          score={85}
          mode="expanded"
          confidence={0.9}
          factors={[
            { name: 'Test Factor', impact: 20, reasoning: 'Test reasoning' },
          ]}
        />
      );

      const badge = screen.getByRole('button');
      fireEvent.click(badge);

      // In expanded mode with factors, clicking should show popover
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Tier Styling', () => {
    it('should apply hot tier styles for scores >= 80', () => {
      render(<ScoreBadge score={85} data-testid="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-success');
    });

    it('should apply warm tier styles for scores 50-79', () => {
      render(<ScoreBadge score={65} data-testid="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-warning');
    });

    it('should apply cold tier styles for scores < 50', () => {
      render(<ScoreBadge score={30} data-testid="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-muted-foreground');
    });
  });

  describe('Size Variants', () => {
    it('should render small size', () => {
      render(<ScoreBadge score={85} size="sm" data-testid="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-xs');
    });

    it('should render medium size', () => {
      render(<ScoreBadge score={85} size="md" data-testid="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-sm');
    });

    it('should render large size', () => {
      render(<ScoreBadge score={85} size="lg" data-testid="badge" />);
      const badge = screen.getByTestId('badge');
      expect(badge).toHaveClass('text-base');
    });
  });

  describe('Mode Variants', () => {
    it('should render compact mode (default)', () => {
      render(<ScoreBadge score={85} mode="compact" data-testid="badge" />);
      expect(screen.getByTestId('badge')).toBeInTheDocument();
      expect(screen.queryByText('Score')).not.toBeInTheDocument();
    });

    it('should render inline mode with label', () => {
      render(<ScoreBadge score={85} mode="inline" />);
      expect(screen.getByText('Score')).toBeInTheDocument();
    });

    it('should render expanded mode with popover trigger', () => {
      render(
        <ScoreBadge
          score={85}
          mode="expanded"
          factors={[
            { name: 'Factor 1', impact: 10, reasoning: 'test' },
          ]}
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Icon Display', () => {
    it('should show fire icon for hot tier', () => {
      render(<ScoreBadge score={85} showIcon data-testid="badge" />);
      expect(screen.getByText('local_fire_department')).toBeInTheDocument();
    });

    it('should show thermostat icon for warm tier', () => {
      render(<ScoreBadge score={65} showIcon data-testid="badge" />);
      expect(screen.getByText('thermostat')).toBeInTheDocument();
    });

    it('should show ac_unit icon for cold tier', () => {
      render(<ScoreBadge score={30} showIcon data-testid="badge" />);
      expect(screen.getByText('ac_unit')).toBeInTheDocument();
    });

    it('should not show icon by default', () => {
      render(<ScoreBadge score={85} />);
      expect(screen.queryByText('local_fire_department')).not.toBeInTheDocument();
    });
  });

  describe('Confidence Display', () => {
    it('should show confidence when provided and mode is inline', () => {
      render(<ScoreBadge score={85} confidence={0.9} mode="inline" showConfidence />);
      expect(screen.getByText('90%')).toBeInTheDocument();
    });

    it('should not show confidence in compact mode', () => {
      render(<ScoreBadge score={85} confidence={0.9} mode="compact" showConfidence />);
      expect(screen.queryByText('90%')).not.toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('should forward HTML attributes', () => {
      render(<ScoreBadge score={85} data-testid="test-badge" />);
      expect(screen.getByTestId('test-badge')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<ScoreBadge score={85} className="custom-class" data-testid="badge" />);
      expect(screen.getByTestId('badge')).toHaveClass('custom-class');
    });

    it('should handle onClick in expanded mode', () => {
      const handleClick = vi.fn();
      render(
        <ScoreBadge
          score={85}
          mode="expanded"
          onClick={handleClick}
          factors={[{ name: 'test', impact: 10, reasoning: 'test' }]}
        />
      );
      fireEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(<ScoreBadge score={85} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have appropriate aria-label', () => {
      render(<ScoreBadge score={85} />);
      expect(screen.getByLabelText(/score.*85/i)).toBeInTheDocument();
    });

    it('should have role button in expanded mode', () => {
      render(
        <ScoreBadge
          score={85}
          mode="expanded"
          factors={[{ name: 'test', impact: 10, reasoning: 'test' }]}
        />
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle score of 0', () => {
      render(<ScoreBadge score={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should handle score of 100', () => {
      render(<ScoreBadge score={100} />);
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should handle empty factors array', () => {
      render(<ScoreBadge score={85} mode="expanded" factors={[]} />);
      expect(screen.getByText('85')).toBeInTheDocument();
    });
  });
});
