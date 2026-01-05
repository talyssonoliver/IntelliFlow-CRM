// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { axe, toHaveNoViolations } from 'vitest-axe';
import { ScoreFactorList } from '../src/components/score/ScoreFactorList';

expect.extend(toHaveNoViolations);

describe('ScoreFactorList', () => {
  const defaultFactors = [
    { name: 'Factor A', impact: 20, reasoning: 'Reasoning A' },
    { name: 'Factor B', impact: -15, reasoning: 'Reasoning B' },
    { name: 'Factor C', impact: 10, reasoning: 'Reasoning C' },
    { name: 'Factor D', impact: -5, reasoning: 'Reasoning D' },
    { name: 'Factor E', impact: 8, reasoning: 'Reasoning E' },
  ];

  describe('Rendering', () => {
    it('should render all factors when expanded', () => {
      render(<ScoreFactorList factors={defaultFactors} expanded />);
      expect(screen.getByText('Factor A')).toBeInTheDocument();
      expect(screen.getByText('Factor B')).toBeInTheDocument();
      expect(screen.getByText('Factor C')).toBeInTheDocument();
      expect(screen.getByText('Factor D')).toBeInTheDocument();
      expect(screen.getByText('Factor E')).toBeInTheDocument();
    });

    it('should render limited factors when collapsed', () => {
      render(<ScoreFactorList factors={defaultFactors} collapsedLimit={3} />);
      expect(screen.getByText('Factor A')).toBeInTheDocument();
      expect(screen.getByText('Factor B')).toBeInTheDocument();
      expect(screen.getByText('Factor C')).toBeInTheDocument();
      expect(screen.queryByText('Factor D')).not.toBeInTheDocument();
      expect(screen.queryByText('Factor E')).not.toBeInTheDocument();
    });

    it('should show "Show more" button when collapsed', () => {
      render(<ScoreFactorList factors={defaultFactors} collapsedLimit={3} />);
      expect(screen.getByRole('button', { name: /show.*more/i })).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('should sort by impact when sortByImpact is true', () => {
      render(<ScoreFactorList factors={defaultFactors} sortByImpact expanded />);
      const factorNames = screen.getAllByText(/Factor [A-E]/);
      // Should be sorted by absolute impact: A(20), B(-15), C(10), E(8), D(-5)
      expect(factorNames[0]).toHaveTextContent('Factor A');
      expect(factorNames[1]).toHaveTextContent('Factor B');
    });

    it('should preserve original order when sortByImpact is false', () => {
      render(<ScoreFactorList factors={defaultFactors} expanded />);
      const factorNames = screen.getAllByText(/Factor [A-E]/);
      expect(factorNames[0]).toHaveTextContent('Factor A');
      expect(factorNames[1]).toHaveTextContent('Factor B');
      expect(factorNames[2]).toHaveTextContent('Factor C');
    });
  });

  describe('Expand/Collapse', () => {
    it('should expand when "Show more" is clicked', () => {
      render(<ScoreFactorList factors={defaultFactors} collapsedLimit={3} />);

      expect(screen.queryByText('Factor D')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /show.*more/i }));

      expect(screen.getByText('Factor D')).toBeInTheDocument();
      expect(screen.getByText('Factor E')).toBeInTheDocument();
    });

    it('should collapse when "Show less" is clicked', () => {
      render(<ScoreFactorList factors={defaultFactors} collapsedLimit={3} />);

      // Expand first
      fireEvent.click(screen.getByRole('button', { name: /show.*more/i }));
      expect(screen.getByText('Factor D')).toBeInTheDocument();

      // Collapse
      fireEvent.click(screen.getByRole('button', { name: /show.*less/i }));
      expect(screen.queryByText('Factor D')).not.toBeInTheDocument();
    });
  });

  describe('Impact Summary', () => {
    it('should show positive impact total', () => {
      render(<ScoreFactorList factors={defaultFactors} showSummary expanded />);
      // Total positive: 20 + 10 + 8 = 38
      expect(screen.getByText(/\+38/)).toBeInTheDocument();
    });

    it('should show negative impact total', () => {
      render(<ScoreFactorList factors={defaultFactors} showSummary expanded />);
      // Total negative: -15 + -5 = -20
      expect(screen.getByText(/-20/)).toBeInTheDocument();
    });
  });

  describe('Impact Bars', () => {
    it('should show impact bars when showImpactBars is true', () => {
      render(<ScoreFactorList factors={defaultFactors} showImpactBars expanded />);
      expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
    });

    it('should not show impact bars by default', () => {
      render(<ScoreFactorList factors={defaultFactors} expanded />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('should forward HTML attributes', () => {
      render(
        <ScoreFactorList factors={defaultFactors} data-testid="factor-list" />
      );
      expect(screen.getByTestId('factor-list')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <ScoreFactorList
          factors={defaultFactors}
          className="custom-class"
          data-testid="factor-list"
        />
      );
      expect(screen.getByTestId('factor-list')).toHaveClass('custom-class');
    });
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <ScoreFactorList factors={defaultFactors} showImpactBars expanded />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have list role', () => {
      render(<ScoreFactorList factors={defaultFactors} expanded />);
      expect(screen.getByRole('list')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty factors array', () => {
      render(<ScoreFactorList factors={[]} />);
      expect(screen.getByText(/no factors/i)).toBeInTheDocument();
    });

    it('should handle single factor', () => {
      render(<ScoreFactorList factors={[defaultFactors[0]]} />);
      expect(screen.getByText('Factor A')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /show/i })).not.toBeInTheDocument();
    });

    it('should not show "Show more" when all factors fit in collapsed limit', () => {
      render(<ScoreFactorList factors={defaultFactors.slice(0, 2)} collapsedLimit={3} />);
      expect(screen.queryByRole('button', { name: /show/i })).not.toBeInTheDocument();
    });
  });
});
