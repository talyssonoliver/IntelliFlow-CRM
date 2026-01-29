// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { ScoreFactor as ScoreFactorComponent } from '../src/components/score/ScoreFactor';

describe('ScoreFactor', () => {
  const defaultFactor = {
    name: 'Email Domain Quality',
    impact: 15,
    reasoning: 'Corporate email domain indicates serious buyer intent',
  };

  describe('Rendering', () => {
    it('should render factor name', () => {
      render(<ScoreFactorComponent factor={defaultFactor} />);
      expect(screen.getByText('Email Domain Quality')).toBeInTheDocument();
    });

    it('should render impact value with sign', () => {
      render(<ScoreFactorComponent factor={defaultFactor} />);
      expect(screen.getByText('+15')).toBeInTheDocument();
    });

    it('should render negative impact with sign', () => {
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, impact: -10 }}
        />
      );
      expect(screen.getByText('-10')).toBeInTheDocument();
    });
  });

  describe('Impact Styling', () => {
    it('should apply success color for positive impact', () => {
      render(<ScoreFactorComponent factor={defaultFactor} data-testid="factor" />);
      const impact = screen.getByText('+15');
      expect(impact).toHaveClass('text-success');
    });

    it('should apply destructive color for negative impact', () => {
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, impact: -10 }}
          data-testid="factor"
        />
      );
      const impact = screen.getByText('-10');
      expect(impact).toHaveClass('text-destructive');
    });

    it('should apply muted color for neutral impact', () => {
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, impact: 0 }}
          data-testid="factor"
        />
      );
      const impact = screen.getByText('+0');
      expect(impact).toHaveClass('text-muted-foreground');
    });
  });

  describe('Impact Bar', () => {
    it('should show impact bar when showImpactBar is true', () => {
      render(<ScoreFactorComponent factor={defaultFactor} showImpactBar />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should not show impact bar by default', () => {
      render(<ScoreFactorComponent factor={defaultFactor} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('should show positive impact bar with success color', () => {
      render(<ScoreFactorComponent factor={defaultFactor} showImpactBar />);
      const bar = screen.getByRole('progressbar');
      expect(bar.querySelector('[data-direction="positive"]')).toBeInTheDocument();
    });

    it('should show negative impact bar with destructive color', () => {
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, impact: -10 }}
          showImpactBar
        />
      );
      const bar = screen.getByRole('progressbar');
      expect(bar.querySelector('[data-direction="negative"]')).toBeInTheDocument();
    });
  });

  describe('Expandable Reasoning', () => {
    it('should show expand button when factor has reasoning', () => {
      render(<ScoreFactorComponent factor={defaultFactor} />);
      expect(screen.getByRole('button', { name: /expand/i })).toBeInTheDocument();
    });

    it('should be collapsed by default', () => {
      render(<ScoreFactorComponent factor={defaultFactor} />);
      // When collapsed, the wrapper has aria-hidden="true" and max-h-0 opacity-0
      const reasoningContainer = screen.getByText(defaultFactor.reasoning).parentElement;
      expect(reasoningContainer).toHaveAttribute('aria-hidden', 'true');
      expect(reasoningContainer).toHaveClass('max-h-0', 'opacity-0');
    });

    it('should expand on click', () => {
      render(<ScoreFactorComponent factor={defaultFactor} />);
      fireEvent.click(screen.getByRole('button', { name: /expand/i }));
      expect(screen.getByText(defaultFactor.reasoning)).toBeVisible();
    });

    it('should be expanded by default when defaultExpanded is true', () => {
      render(<ScoreFactorComponent factor={defaultFactor} defaultExpanded />);
      expect(screen.getByText(defaultFactor.reasoning)).toBeVisible();
    });

    it('should not show expand button when reasoning is empty', () => {
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, reasoning: '' }}
        />
      );
      expect(screen.queryByRole('button', { name: /expand/i })).not.toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('should forward HTML attributes', () => {
      render(
        <ScoreFactorComponent factor={defaultFactor} data-testid="test-factor" />
      );
      expect(screen.getByTestId('test-factor')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <ScoreFactorComponent
          factor={defaultFactor}
          className="custom-class"
          data-testid="factor"
        />
      );
      expect(screen.getByTestId('factor')).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ScoreFactorComponent factor={defaultFactor} showImpactBar />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have descriptive aria-label for impact bar', () => {
      render(<ScoreFactorComponent factor={defaultFactor} showImpactBar />);
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-label', expect.stringContaining('impact'));
    });

    it('should have aria-expanded on reasoning toggle', () => {
      render(<ScoreFactorComponent factor={defaultFactor} />);
      const button = screen.getByRole('button', { name: /expand/i });
      expect(button).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long factor names', () => {
      const longName = 'A'.repeat(100);
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, name: longName }}
          data-testid="factor"
        />
      );
      expect(screen.getByTestId('factor')).toBeInTheDocument();
    });

    it('should handle zero impact', () => {
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, impact: 0 }}
        />
      );
      expect(screen.getByText('+0')).toBeInTheDocument();
    });

    it('should handle large impact values', () => {
      render(
        <ScoreFactorComponent
          factor={{ ...defaultFactor, impact: 50 }}
          showImpactBar
        />
      );
      expect(screen.getByText('+50')).toBeInTheDocument();
    });
  });
});
